/* eslint-disable @typescript-eslint/no-explicit-any -- one-off standalone Docs setup tool */
// Place the 8 MUAP narrative fill-slots on the live master so the AI 5C+1S draft (generateMuapNarrative
// → seed.ts replaceAllText) lands as an EDITABLE first draft NEXT TO each section's human-fill guidance
// prompt. Reverses the 2026.06.08 "granular-prompts-only" posture (docs/designs/document-system.md) — the
// analyst still owns + edits the prose before freeze; the slot is labelled "Draf analisa AI".
//
// Anchored on the body guidance prompt (NOT the coloured section heading) so the inserted paragraph is a
// normal body paragraph — the style is force-normalized (NORMAL_TEXT, shading + bold/italic + colour cleared)
// so it never inherits a heading band. SELF-HEALING: removes any prior slot paragraph for a bracket before
// re-placing it, so a re-run relocates/restyles in place.
//
// SAFETY: APPLY backs the master up first (files.copy) + verifies all 8 brackets present after. DRY default.
//   DRY:   tsx scripts/place-narrative-slots.ts <masterMuapDocId>
//   APPLY: APPLY=1 tsx scripts/place-narrative-slots.ts <masterMuapDocId>
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

function clients() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return { docs: google.docs({ version: 'v1', auth: c }), drive: google.drive({ version: 'v3', auth: c }) }
}
const log = (...a: any[]) => console.log('[place-narrative]', ...a)

const LABEL = '📝 Draf analisa AI (sunting/lengkapi sebelum finalisasi): '

// Each slot: a UNIQUE body substring of the section's human-fill guidance prompt to anchor AFTER + the
// bracket the fill step (doc-registry MUAP_NARRATIVE_VARS) searches for. (Anchors are body text — never a
// coloured heading — so the inserted draft is a plain body paragraph.)
const SLOTS: { anchor: string; bracket: string }[] = [
  { anchor: '[Jelaskan kondisi fasilitas existing di bank ini', bracket: '[Ringkasan Usulan]' },
  { anchor: 'Sesuai akta terakhir, berikut susunan Pengurus', bracket: '[Analisis Character]' },
  { anchor: '[Uraikan industri di mana nasabah beroperasi', bracket: '[Analisis Condition]' },
  { anchor: '[Berikan narasi analisis tren', bracket: '[Analisis Capacity]' },
  { anchor: '[Analisis kunci neraca', bracket: '[Analisis Capital]' },
  { anchor: '[Jelaskan kebutuhan pembiayaan nasabah secara naratif', bracket: '[Narasi Tujuan Pembiayaan]' },
  { anchor: '[Tuliskan: (1) status kepemilikan agunan', bracket: '[Analisis Collateral]' },
  { anchor: '[Tuliskan opini syariah secara naratif', bracket: '[Analisis Aspek Syariah]' },
]

// Yield each paragraph in document order (incl. tables) as { chars, idx } where idx[k] is the ABSOLUTE doc
// index of char k. Mirrors scripts/setup-v35-namedranges.ts.
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

async function getParas(docs: any, masterId: string) {
  const d = (await docs.documents.get({ documentId: masterId, fields: 'title,body' })).data
  return { title: d.title as string, paras: [...paragraphs(d.body?.content ?? [])] }
}

async function main() {
  const [masterId] = process.argv.slice(2)
  if (!masterId) throw new Error('usage: place-narrative-slots.ts <masterMuapDocId>')
  const apply = process.env.APPLY === '1'
  const { docs, drive } = clients()

  const { title, paras } = await getParas(docs, masterId)
  log(`master "${title}" (${masterId})`)

  // Resolve each slot's anchor + any existing (prior-run) slot paragraph to remove.
  const plan: { bracket: string; anchor: string }[] = []
  const warnings: string[] = []
  for (const slot of SLOTS) {
    const anchors = paras.filter((p) => p.chars.includes(slot.anchor))
    if (anchors.length !== 1) { warnings.push(`MISSING/AMBIGUOUS anchor "${slot.anchor}" — ${anchors.length} match(es); skipping ${slot.bracket}`); continue }
    plan.push({ bracket: slot.bracket, anchor: slot.anchor })
  }
  const existingSlots = paras.filter((p) => p.chars.includes(LABEL.trim().slice(0, 14)) || /Draf analisa AI/.test(p.chars))
  for (const t of plan) log(`  PLAN place "${t.bracket}" after guidance "${t.anchor.slice(0, 40)}…"`)
  log(`  prior slot paragraphs to remove first: ${existingSlots.length}`)
  for (const w of warnings) log(`  ⚠️ ${w}`)
  if (!plan.length) { log('nothing to place.'); return }
  if (!apply) { log(`DRY-RUN (${plan.length} placement(s); ${existingSlots.length} prior to remove). Re-run with APPLY=1.`); return }

  // 1. BACKUP first (reuse an existing pre-change backup if one is already there).
  const prior = (await drive.files.list({ q: "name contains 'BACKUP MUAP master before narrative-slots' and trashed=false", fields: 'files(id,name)' })).data.files ?? []
  const backup = prior[0]?.id ?? (await drive.files.copy({ fileId: masterId, requestBody: { name: `BACKUP MUAP master before narrative-slots ${new Date().toISOString().slice(0, 10)}` }, fields: 'id' })).data.id
  log(`1. BACKUP: ${backup}${prior[0] ? ' (reused)' : ' (created)'} — RECORD in document-templates.md`)

  // 2. REMOVE any prior slot paragraphs. They live as the 2nd paragraph inside a heading's (table) cell, so
  //    we delete the PRECEDING newline + the slot text but KEEP the slot's own newline as the cell terminal
  //    (deleting a cell's last newline is illegal). Range [idx0-1, idxLast). One batch per slot, descending
  //    by start index so original indices stay valid (a delete never shifts lower indices).
  if (existingSlots.length) {
    const dels = existingSlots
      .map((p) => ({ startIndex: p.idx[0] - 1, endIndex: p.idx[p.idx.length - 1] }))
      .sort((a, b) => b.startIndex - a.startIndex)
    for (const range of dels) await docs.documents.batchUpdate({ documentId: masterId, requestBody: { requests: [{ deleteContentRange: { range } }] } })
    log(`2. removed ${existingSlots.length} prior slot paragraph(s)`)
  }

  // 3. INSERT each slot as its own NORMAL_TEXT body paragraph right after its guidance prompt. One section
  //    per batchUpdate with a fresh get so indices never go stale. Insert "\n<LABEL><bracket>" INSIDE the
  //    anchor paragraph (before its terminal newline); the split inherits the anchor's (body) style, then we
  //    force NORMAL_TEXT + clear shading/bold/italic/colour so it can never look like a heading band.
  let done = 0
  for (const t of plan) {
    const { paras: fresh } = await getParas(docs, masterId)
    const p = fresh.find((q) => q.chars.includes(t.anchor))
    if (!p) { log(`  ⚠️ anchor vanished mid-run: "${t.anchor}" — skipping`); continue }
    const nlIdx = p.idx[p.idx.length - 1] // the anchor paragraph's terminal '\n' (inside its bounds)
    const body = `${LABEL}${t.bracket}`
    const newStart = nlIdx + 1
    await docs.documents.batchUpdate({
      documentId: masterId,
      requestBody: {
        requests: [
          { insertText: { location: { index: nlIdx }, text: `\n${body}` } },
          { updateParagraphStyle: { range: { startIndex: newStart, endIndex: newStart + body.length + 1 }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT', shading: { backgroundColor: {} } }, fields: 'namedStyleType,shading.backgroundColor' } },
          { updateTextStyle: { range: { startIndex: newStart, endIndex: newStart + body.length }, textStyle: { bold: false, italic: false }, fields: 'bold,italic,foregroundColor,backgroundColor' } },
        ],
      },
    })
    done++
    log(`  ✓ placed ${t.bracket}`)
  }
  log(`3. placed ${done}/${plan.length} narrative slot paragraph(s)`)

  // 4. VERIFY: re-read; every bracket present.
  const { paras: after } = await getParas(docs, masterId)
  const afterText = after.map((p) => p.chars).join('')
  const missing = plan.filter((t) => !afterText.includes(t.bracket))
  if (missing.length) { log(`4. ⚠️ VERIFY FAILED — missing: ${missing.map((m) => m.bracket).join(', ')}. Backup at ${backup}.`); return }
  log(`4. VERIFY OK — all ${plan.length} brackets present on master. Backup: ${backup}`)
}
void main()
