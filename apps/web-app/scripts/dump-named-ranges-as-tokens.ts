/**
 * Diagnostic: COPY the master MUAP + RSK Docs (via Drive), then in each copy
 * replace every NamedRange's content with `{{<rangeName>}}` so you can VISUALLY
 * see which placeholders are wired to a NamedRange and which aren't.
 *
 * The live masters are NOT touched — Drive `files.copy` creates new files.
 * Hidden `${{x}}…${{/x}}` extraction sentinels remain in place (still 1pt
 * white); only the value INSIDE each NamedRange is rewritten. Substituted
 * text is forced black + 10pt so it reads through any inherited hidden style.
 *
 * Run:  pnpm exec tsx apps/web-app/scripts/dump-named-ranges-as-tokens.ts
 *
 * Prints the new Doc URLs at the end. Throwaway diagnostic copies — delete
 * from Drive when you're done.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import type { docs_v1 } from 'googleapis'
import { docsClient, driveClient } from '../src/server/google/clients'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

interface RangeSpan {
  name: string
  startIndex: number
  endIndex: number
}

// Flatten doc.namedRanges → one row per concrete span. Each name can map to
// multiple NamedRange objects, and each can carry multiple `ranges`.
function collectSpans(doc: docs_v1.Schema$Document): RangeSpan[] {
  const out: RangeSpan[] = []
  const groups = doc.namedRanges ?? {}
  for (const [name, group] of Object.entries(groups)) {
    for (const nr of group.namedRanges ?? []) {
      for (const r of nr.ranges ?? []) {
        if (typeof r.startIndex !== 'number' || typeof r.endIndex !== 'number') continue
        out.push({ name, startIndex: r.startIndex, endIndex: r.endIndex })
      }
    }
  }
  return out
}

async function rewriteCopy(docs: docs_v1.Docs, drive: ReturnType<typeof driveClient>, label: string, sourceId: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const copyName = `[NAMEDRANGE-DUMP ${stamp}] ${label}`
  const copied = await drive.files.copy({ fileId: sourceId, requestBody: { name: copyName }, fields: 'id' })
  const newId = copied.data.id
  if (!newId) throw new Error(`copy of ${label} returned no id`)

  const doc = (await docs.documents.get({ documentId: newId })).data
  const spans = collectSpans(doc)
  if (spans.length === 0) {
    console.log(`[${label}] copy ${newId} — no named ranges found.`)
    return `https://docs.google.com/document/d/${newId}/edit`
  }

  // Descending startIndex: a later edit never invalidates an earlier (lower-
  // index) span's indices. Skip zero-width ranges' delete; just insertText.
  spans.sort((a, b) => b.startIndex - a.startIndex)

  const requests: docs_v1.Schema$Request[] = []
  for (const s of spans) {
    const replacement = `{{${s.name}}}`
    if (s.endIndex > s.startIndex) {
      requests.push({ deleteContentRange: { range: { startIndex: s.startIndex, endIndex: s.endIndex } } })
    }
    requests.push({ insertText: { location: { index: s.startIndex }, text: replacement } })
    // Force readable styling on the inserted token (in case the surrounding
    // run is hidden 1pt white from the extraction sentinels).
    requests.push({
      updateTextStyle: {
        range: { startIndex: s.startIndex, endIndex: s.startIndex + replacement.length },
        textStyle: {
          foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
          fontSize: { magnitude: 10, unit: 'PT' },
          bold: true,
        },
        fields: 'foregroundColor,fontSize,bold',
      },
    })
  }

  await docs.documents.batchUpdate({ documentId: newId, requestBody: { requests } })
  console.log(`[${label}] copy ${newId} — substituted ${spans.length} span(s) across ${new Set(spans.map((s) => s.name)).size} unique range name(s).`)
  return `https://docs.google.com/document/d/${newId}/edit`
}

async function main() {
  const muap = process.env.GOOGLE_MASTER_MUAP_DOC_ID
  const rsk = process.env.GOOGLE_MASTER_RSK_DOC_ID
  if (!muap || !rsk) throw new Error('Missing GOOGLE_MASTER_{MUAP,RSK}_DOC_ID in apps/web-app/.env.local')

  const docs = docsClient()
  const drive = driveClient()

  const muapUrl = await rewriteCopy(docs, drive, 'MUAP', muap)
  const rskUrl = await rewriteCopy(docs, drive, 'RSK', rsk)

  console.log('\nOpen the diagnostic copies:')
  console.log(`  MUAP: ${muapUrl}`)
  console.log(`  RSK:  ${rskUrl}`)
  console.log('\nAnywhere you see plain prose / a blank / a guidance bracket but NO `{{name}}`, that placeholder has no NamedRange wired yet.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
