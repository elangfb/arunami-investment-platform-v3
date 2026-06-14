/* eslint-disable @typescript-eslint/no-explicit-any -- one-off standalone Drive setup tool */
// Batch 4 V3.5 T3 — create the value-fill NamedRanges on the MUAP master. Creating a NamedRange is
// METADATA-only (no visible text changes), so master fidelity is preserved by construction. Still:
// APPLY backs the master up first (files.copy) and records the backup id. DRY-RUN by default (read-only).
//   DRY:    tsx scripts/setup-v35-namedranges.ts <masterMuapDocId>
//   APPLY:  APPLY=1 tsx scripts/setup-v35-namedranges.ts <masterMuapDocId>
import { google } from 'googleapis'

function clients() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return { docs: google.docs({ version: 'v1', auth: c }), drive: google.drive({ version: 'v3', auth: c }) }
}
const log = (...a: any[]) => console.log('[v35-setup]', ...a)

// Slot specs: each match (in document order) maps to one NamedRange. `group` = which regex group is
// the range (0 = whole match for the composite No.MUAP/Tanggal; 1 = the underscore run for plafond/tenor).
const SLOTS = [
  { type: 'no_muap', names: ['muap_no_muap_cover', 'muap_no_muap_identitas'], re: /_{2,}\/MUAP-MKT\/_{2,}\/20_{2,}/g, group: 0 },
  { type: 'tanggal', names: ['muap_tanggal_cover', 'muap_tanggal_identitas'], re: /_{2,} +_{2,} +20_{2,}/g, group: 0 },
  // Anchor on the [Plafond Terbilang] token so we match ONLY the 2 plafond slots, not other Rp ___,- cells.
  { type: 'plafond', names: ['muap_plafond_facility', 'muap_plafond_recommendation'], re: /Rp (_{2,}),-\s*\(\[Plafond Terbilang\]\)/g, group: 1 },
  { type: 'tenor', names: ['muap_tenor'], re: /(_{2,}) Bulan/g, group: 1 },
] as const

// Yield each paragraph as { chars: string, idx: number[] } where idx[j] = the ABSOLUTE doc index of
// char j (so a regex match [a,b) → range [idx[a], idx[b-1]+1)). Walks tables too, in document order.
function* paragraphs(content: any[]): Generator<{ chars: string; idx: number[] }> {
  for (const el of content ?? []) {
    if (el.paragraph) {
      let chars = ''
      const idx: number[] = []
      for (const pe of el.paragraph.elements ?? []) {
        const t = pe.textRun?.content
        if (t == null || pe.startIndex == null) continue
        for (let k = 0; k < t.length; k++) { chars += t[k]; idx.push(pe.startIndex + k) }
      }
      if (chars) yield { chars, idx }
    }
    if (el.table) for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) yield* paragraphs(cell.content)
  }
}

type Found = { name: string; startIndex: number; endIndex: number; matched: string }

function findRanges(content: any[]): { found: Found[]; warnings: string[] } {
  const found: Found[] = []
  const warnings: string[] = []
  for (const slot of SLOTS) {
    const hits: { startIndex: number; endIndex: number; matched: string }[] = []
    for (const p of paragraphs(content)) {
      for (const m of p.chars.matchAll(slot.re)) {
        // Compute the sub-span for the chosen group within the full match.
        const gStr = slot.group === 0 ? m[0] : m[1]
        const gOffset = slot.group === 0 ? 0 : m[0].indexOf(m[1])
        const a = (m.index ?? 0) + gOffset
        const b = a + gStr.length
        hits.push({ startIndex: p.idx[a], endIndex: p.idx[b - 1] + 1, matched: gStr })
      }
    }
    slot.names.forEach((name, i) => {
      if (hits[i]) found.push({ name, ...hits[i] })
      else warnings.push(`MISSING: ${name} — only ${hits.length} "${slot.type}" occurrence(s) found`)
    })
    if (hits.length > slot.names.length) warnings.push(`EXTRA: ${slot.type} found ${hits.length} > ${slot.names.length} named — extra occurrences NOT assigned`)
  }
  return { found, warnings }
}

async function main() {
  const [masterId] = process.argv.slice(2)
  if (!masterId) throw new Error('usage: setup-v35-namedranges.ts <masterMuapDocId>')
  const apply = process.env.APPLY === '1'
  const { docs, drive } = clients()

  const doc = (await docs.documents.get({ documentId: masterId, fields: 'title,body,namedRanges' })).data
  log(`master "${doc.title}" (${masterId}) — existing namedRanges: ${Object.keys(doc.namedRanges ?? {}).join(', ') || '(none of ours)'}`)
  const { found, warnings } = findRanges(doc.body?.content ?? [])
  for (const f of found) log(`  ${f.name}: [${f.startIndex},${f.endIndex}) = "${f.matched}"`)
  for (const w of warnings) log(`  ⚠️ ${w}`)
  // Refuse to create a range whose name already exists (avoid dup-occurrence leak).
  const existing = new Set(Object.keys((doc as any).namedRanges ?? {}))
  const toCreate = found.filter((f) => !existing.has(f.name))
  log(`plan: create ${toCreate.length} NamedRange(s); ${found.length - toCreate.length} already exist`)

  if (!apply) { log('DRY-RUN (no mutation). Re-run with APPLY=1 to back up + create.'); return }
  if (!toCreate.length) { log('nothing to create.'); return }

  // 1. BACKUP the master first.
  const backup = (await drive.files.copy({ fileId: masterId, requestBody: { name: `BACKUP MUAP master before V3.5 ranges` }, fields: 'id' })).data.id
  log(`1. BACKUP created: ${backup} — RECORD THIS in document-templates.md`)

  // 2. Create the NamedRanges (metadata only — no text change).
  await docs.documents.batchUpdate({ documentId: masterId, requestBody: { requests: toCreate.map((f) => ({ createNamedRange: { name: f.name, range: { startIndex: f.startIndex, endIndex: f.endIndex } } })) } })
  log(`2. created ${toCreate.length} NamedRange(s) on the master`)

  // 3. Verify: re-read; every target range now present.
  const after = (await docs.documents.get({ documentId: masterId, fields: 'namedRanges' })).data
  const have = after.namedRanges ?? {}
  const missing = found.filter((f) => !have[f.name])
  if (missing.length) { log(`3. ⚠️ VERIFY FAILED — missing: ${missing.map((m) => m.name).join(', ')}. Master metadata changed but ranges incomplete; backup at ${backup}.`); return }
  log(`3. VERIFY OK — all ${found.length} ranges registered. Backup: ${backup}`)
}
void main()
