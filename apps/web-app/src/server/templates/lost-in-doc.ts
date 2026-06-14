import 'server-only'

import { listLostFills, updateFill } from '@/server/repo/document-fill'

/**
 * Lost-in-doc reader + pre-freeze gate (T12).
 *
 * Surfaces every ApplicationDocumentFill row with status='lost-in-doc' for an app —
 * these are tokens whose NamedRange disappeared from the Doc (analyst-deleted cell).
 * The recovery path:
 *   - Pre-freeze banner lists the lost fields with last-known value (UI).
 *   - Analyst either re-fills in the app form (Fill.source='analyst-app-edit',
 *     no write-back to Doc) OR re-adds the cell in the Doc.
 *   - Pre-freeze checkpoint refuses to proceed until the banner is explicitly ack'd.
 */

export interface LostFieldRow {
  tokenName: string
  docId: string
  lastValue: string | null
  lostAt: Date
}

export async function getLostInDocFields(appId: string): Promise<LostFieldRow[]> {
  const rows = await listLostFills(appId)
  return rows.map((r) => ({
    tokenName: r.tokenName,
    docId: r.docId,
    lastValue: r.value,
    lostAt: r.lastSyncedAt,
  }))
}

/**
 * Pre-freeze guard: throws if any field is still lost-in-doc and `ackedAt` is null/older
 * than the most-recent lost-detection. Callers wire this into the freeze action.
 */
export async function assertLostInDocAcked(
  appId: string,
  ackedAt: Date | null,
): Promise<void> {
  const fields = await getLostInDocFields(appId)
  if (!fields.length) return
  const latestLost = fields.reduce<Date>(
    (acc, f) => (f.lostAt > acc ? f.lostAt : acc),
    new Date(0),
  )
  if (!ackedAt || ackedAt.getTime() < latestLost.getTime()) {
    throw new Error(
      `Freeze blocked: ${fields.length} field(s) lost in Doc — analyst must acknowledge before freezing PDFs (latest lost at ${latestLost.toISOString()}).`,
    )
  }
}

/**
 * Resolution: analyst re-fills value via the app form. Source flips to analyst-app-edit;
 * status flips to 'filled'. NO write-back to Doc (per design — Doc analyst can re-add the
 * cell separately, and the sync will pick it up).
 */
export async function reclaimLostField(input: {
  appId: string
  docId: string
  tokenName: string
  value: string
}): Promise<void> {
  await updateFill(input.appId, input.docId, input.tokenName, {
    value: input.value,
    source: 'analyst-app-edit',
    status: 'filled',
    lastSyncedAt: new Date(),
  })
}
