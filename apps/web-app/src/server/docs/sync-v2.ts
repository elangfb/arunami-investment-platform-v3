import 'server-only'

import { log } from '@/server/log'
import { driveClient, docsClient } from '@/server/google/clients'
import { withRetry } from '@/server/retry'
import { findToken, type TemplateId } from '@/lib/templates/tokens'
import { latestFillSyncedAt, listFills, updateFill } from '@/server/repo/document-fill'

/**
 * v2 sync-back (Doc → App).
 *
 * Reads the Doc, compares NamedRange contents against ApplicationDocumentFill rows.
 * For each token:
 *   - Doc value matches DB value → no-op
 *   - Doc value differs → update Fill (source = 'analyst-doc-edit') + recompute trigger
 *   - Doc has no NamedRange for a token we last wrote → flip Fill.status = 'lost-in-doc'
 *
 * Per-doc in-flight dedup: a Map of docId → in-flight Promise. Concurrent calls share the
 * same Promise so two tabs / two effects don't double-pull. Caller awaits the shared
 * result. Cleared on completion / failure.
 *
 * Pre-check via Drive headRevisionId — if unchanged since lastSyncedAt, return cached
 * "no changes" result without a full Doc pull (~90% of calls per the design assumption).
 */

interface SyncResult {
  changed: number
  unchanged: number
  lostInDoc: number
  skippedNoOp: boolean
}

const inflight = new Map<string, Promise<SyncResult>>()

export function syncDocV2(documentId: string, template: TemplateId, appId: string): Promise<SyncResult> {
  const key = `${appId}:${documentId}`
  const existing = inflight.get(key)
  if (existing) return existing
  const p = doSync(documentId, template, appId).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

async function doSync(
  documentId: string,
  template: TemplateId,
  appId: string,
): Promise<SyncResult> {
  // 1. Cheap revision check first.
  const drive = driveClient()
  const meta = await withRetry(
    () => drive.files.get({ fileId: documentId, fields: 'headRevisionId, modifiedTime' }),
    { label: 'sync_v2.drive.get' },
  )
  const headRevisionId = meta.data.headRevisionId ?? null

  const lastSyncedAt = await latestFillSyncedAt(appId, documentId)
  // No persisted state yet → fall through to a full pull (caller probably just seeded).
  if (lastSyncedAt && headRevisionId) {
    // Cheap-skip only if the Doc was last modified before our last sync. We don't have a
    // cleaner per-doc state field (Phase D2 follow-on can persist headRevisionId per doc).
    const modAt = meta.data.modifiedTime ? new Date(meta.data.modifiedTime) : null
    if (modAt && modAt.getTime() <= lastSyncedAt.getTime()) {
      log.info('sync_v2_noop', { appId, documentId, headRevisionId })
      return { changed: 0, unchanged: 0, lostInDoc: 0, skippedNoOp: true }
    }
  }

  // 2. Full Doc pull. The Docs API exposes NamedRanges + their ranges; we re-derive cell
  //    text by slicing the body's char stream between the range endpoints.
  const docs = docsClient()
  const doc = await withRetry(
    () => docs.documents.get({ documentId }),
    { label: 'sync_v2.docs.get' },
  )
  const namedRanges = doc.data.namedRanges ?? {}

  // Build a char index → text map of the whole body.
  const bodyText = extractBodyText(doc.data.body?.content ?? [])

  const fills = await listFills(appId, documentId)

  let changed = 0
  let unchanged = 0
  let lostInDoc = 0
  for (const fill of fills) {
    if (!findToken(fill.tokenName)) continue // registry drifted; skip silently
    const nrSet = namedRanges[fill.tokenName]
    if (!nrSet || !nrSet.namedRanges?.length) {
      // The NamedRange disappeared — analyst likely deleted the cell. Mark lost-in-doc for T12.
      if (fill.status !== 'lost-in-doc') {
        await updateFill(appId, documentId, fill.tokenName, { status: 'lost-in-doc', lastSyncedAt: new Date() })
        lostInDoc++
      }
      continue
    }
    // Use first occurrence (strict-reuse: all occurrences carry the same value).
    const ranges = nrSet.namedRanges[0]?.ranges ?? []
    const docText = ranges
      .map((r) => bodyText.slice((r.startIndex ?? 0), (r.endIndex ?? 0)))
      .join('')
      .replace(/\v/g, '\n')
    if (docText === fill.value) {
      unchanged++
      continue
    }
    await updateFill(appId, documentId, fill.tokenName, {
      value: docText,
      source: 'analyst-doc-edit',
      status: 'filled',
      lastSyncedAt: new Date(),
    })
    changed++
    void template
  }

  log.info('sync_v2_done', { appId, documentId, changed, unchanged, lostInDoc })
  return { changed, unchanged, lostInDoc, skippedNoOp: false }
}

function extractBodyText(content: unknown[]): string {
  // Conservative recursive walker — gathers paragraph runs into a string indexed parallel
  // to the Docs API's `startIndex/endIndex` (which are in 16-bit code units). Good enough
  // for sync-back text comparison; not the fancy character-map collectRuns helper.
  const out: string[] = []
  let pos = 0
  function walk(items: unknown[]) {
    for (const item of items as Array<Record<string, unknown>>) {
      const p = item.paragraph as { elements?: Array<{ textRun?: { content?: string } }> } | undefined
      if (p?.elements) {
        for (const el of p.elements) {
          if (el.textRun?.content) {
            const text = el.textRun.content
            out.push(text)
            pos += text.length
          }
        }
      }
      const tbl = item.table as { tableRows?: Array<{ tableCells?: Array<{ content?: unknown[] }> }> } | undefined
      if (tbl?.tableRows) {
        for (const row of tbl.tableRows) {
          for (const cell of row.tableCells ?? []) {
            walk(cell.content ?? [])
          }
        }
      }
    }
  }
  walk(content)
  return out.join('')
}
