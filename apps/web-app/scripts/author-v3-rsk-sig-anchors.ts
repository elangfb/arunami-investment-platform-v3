// Create the RSK §IX signature-slot NamedRanges (rsk_sig_{analyst,officer,cro}_tanggal + rsk_dps_tanggal)
// that the already-wired stampSignatureQr stamps approval QRs into. The RAW RSK template had none.
//
// §IX signature table (confirmed via structure dump): header row = "Disusun Oleh/Risk Analyst" |
// "Diperiksa Oleh/Risk Officer" | "Disetujui Oleh/CRO"; signature row cells are "(ttd) Nama: NIK:
// Tanggal:". Map column 0/1/2 → analyst/officer/cro and anchor each cell's "Tanggal:" line.
// DPS slot = the "Nama DPS: … Tanggal: …" line in the separate DPS review cell.
// createNamedRange does not shift indices, so all four apply in one batch from a single read.
//   Run: cd apps/web-app && set -a; . .env.local; set +a; [APPLY=1] pnpm exec tsx scripts/author-v3-rsk-sig-anchors.ts

import { google } from 'googleapis'
import type { docs_v1 } from 'googleapis'

const APPLY = process.env.APPLY === '1'
const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const docs = google.docs({ version: 'v1', auth: oauth2 })
const RSK = '1f1PFM0PA1MqeMzopYWvO4IMH4wx27AyMjFHbwIR7n3c'

interface Para { text: string; start: number; end: number }
function paragraphs(content: docs_v1.Schema$StructuralElement[] | undefined): Para[] {
  const out: Para[] = []
  for (const el of content ?? []) {
    const pes = el.paragraph?.elements
    if (pes) {
      let text = ''; let start = -1; let end = -1
      for (const pe of pes) {
        if (pe.startIndex != null && start < 0) start = pe.startIndex
        if (pe.endIndex != null) end = pe.endIndex
        text += pe.textRun?.content ?? ''
      }
      out.push({ text: text.replace(/\s+/g, ' ').trim(), start, end })
    }
    // Recurse into nested tables (the DPS review block nests its "Nama DPS: … Tanggal:" line).
    for (const r of el.table?.tableRows ?? []) for (const c of r.tableCells ?? []) out.push(...paragraphs(c.content ?? undefined))
  }
  return out
}
const cellParas = (cell: docs_v1.Schema$TableCell): Para[] => paragraphs(cell.content ?? undefined)
const cellText = (cell: docs_v1.Schema$TableCell): string => cellParas(cell).map((p) => p.text).join(' ')
// Last paragraph in a cell that mentions "Tanggal" → the date line we anchor (QR lands at its end).
function tanggalLine(cell: docs_v1.Schema$TableCell): Para | undefined {
  const hits = cellParas(cell).filter((p) => /tanggal/i.test(p.text) && p.start >= 0)
  return hits[hits.length - 1]
}

const doc = (await docs.documents.get({ documentId: RSK })).data
const body = doc.body?.content ?? []
const tables = body.map((el) => el.table).filter((t): t is docs_v1.Schema$Table => !!t)

// §IX signature table: header row carries all three "…Oleh" role columns.
const sigTable = tables.find((t) => {
  const r0 = (t.tableRows?.[0]?.tableCells ?? []).map((c) => cellText(c))
  return r0.some((c) => /disusun/i.test(c)) && r0.some((c) => /diperiksa/i.test(c)) && r0.some((c) => /disetujui/i.test(c))
})
// DPS signature cell: uniquely carries the "Nama DPS:" sign-off label (NOT prose mentions of
// "review DPS", which also appear in risk-matrix mitigation cells).
const dpsCell = tables
  .flatMap((t) => (t.tableRows ?? []).flatMap((r) => r.tableCells ?? []))
  .find((c) => /Nama DPS/i.test(cellText(c)))

type Plan = { name: string; line: Para | undefined; desc: string }
const plans: Plan[] = []
if (sigTable) {
  const sigRow = sigTable.tableRows?.[1]?.tableCells ?? []
  plans.push({ name: 'rsk_sig_analyst_tanggal', line: sigRow[0] && tanggalLine(sigRow[0]), desc: 'col0 Disusun/Analyst' })
  plans.push({ name: 'rsk_sig_officer_tanggal', line: sigRow[1] && tanggalLine(sigRow[1]), desc: 'col1 Diperiksa/Officer' })
  plans.push({ name: 'rsk_sig_cro_tanggal', line: sigRow[2] && tanggalLine(sigRow[2]), desc: 'col2 Disetujui/CRO' })
} else console.error('✗ §IX signature table not found')
plans.push({ name: 'rsk_dps_tanggal', line: dpsCell && tanggalLine(dpsCell), desc: 'DPS review cell' })

console.log('Planned anchors:')
for (const p of plans) console.log(`  ${p.name} (${p.desc}) → ${p.line ? `[${p.line.start}..${p.line.end}] ${JSON.stringify(p.line.text.slice(0, 40))}` : 'NOT FOUND'}`)

const missing = plans.filter((p) => !p.line)
if (missing.length) { console.error(`✗ ${missing.length} anchor(s) not located; aborting (no write).`); process.exit(1) }
const already = new Set(Object.keys(doc.namedRanges ?? {}))
const requests = plans
  .filter((p) => !already.has(p.name))
  .map((p) => ({ createNamedRange: { name: p.name, range: { startIndex: p.line!.start, endIndex: p.line!.end } } }))
console.log(`\n${APPLY ? 'APPLYING' : '[dry]'} createNamedRange × ${requests.length} (skipped ${plans.length - requests.length} already present)`)
if (APPLY && requests.length) {
  await docs.documents.batchUpdate({ documentId: RSK, requestBody: { requests } })
  console.log('✓ created')
}
