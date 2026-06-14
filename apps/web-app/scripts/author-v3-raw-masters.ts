// One-off: author the V3 [Label]s into the RAW reference templates (the V3 master source,
// ADR-0013). Replaces a SPECIFIC placeholder occurrence (matched by its table-row label) with the
// registry [Label], by index — NOT replaceAllText, so a generic placeholder used for several fields
// (e.g. RSK [xxx.xxx.xxx] = plafond in one row, the risk-recommended plafond in another) is converted
// only where it is the Mizan-known field. Not-Mizan-known fields are left as their original prompt.
//
// Run DRY first (prints the plan), eyeball, then set APPLY=1 to write. Idempotent: once a placeholder
// is converted it no longer matches, so re-running is a no-op.
//
//   cd apps/web-app && set -a; . .env.local; set +a; pnpm exec tsx scripts/author-v3-raw-masters.ts        # dry
//   cd apps/web-app && set -a; . .env.local; set +a; APPLY=1 pnpm exec tsx scripts/author-v3-raw-masters.ts # write

import { google } from 'googleapis'
import type { docs_v1 } from 'googleapis'

const APPLY = process.env.APPLY === '1'
const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI,
)
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const docs = google.docs({ version: 'v1', auth: oauth2 })

const DOC_ID: Record<string, string> = {
  MUAP: '1rydh9HpZhdWUAgCWJLhMS10CCgdCMnY6fTSZji7eljg',
  RSK: '1f1PFM0PA1MqeMzopYWvO4IMH4wx27AyMjFHbwIR7n3c',
}

// doc · exact table-row label (first cell, ≤50 chars, whitespace-collapsed) · exact placeholder → V3 label.
// Conservative high-confidence set: only rows whose label unambiguously identifies a Mizan-known field.
interface Entry { doc: string; row: string; ph: string; label: string }
const MAP: Entry[] = [
  // ── MUAP — applicant identity, request date, plafond-in-words (each occurrence intended) ──
  { doc: 'MUAP', row: 'Nama Perusahaan dan Inisial', ph: '[Nama Perusahaan]', label: '[Nama Perusahaan Pemohon]' },
  { doc: 'MUAP', row: 'Nama Nasabah', ph: '[Nama Lengkap Perusahaan]', label: '[Nama Perusahaan Pemohon]' },
  { doc: 'MUAP', row: 'IDENTITAS NASABAH', ph: '[Nama Perusahaan]', label: '[Nama Perusahaan Pemohon]' },
  { doc: 'MUAP', row: 'Tanggal Surat Permohonan', ph: '[DD Bulan YYYY]', label: '[Tanggal Pengajuan]' },
  { doc: 'MUAP', row: 'Nilai Permohonan Pembiayaan', ph: '[Terbilang]', label: '[Plafond Terbilang]' },
  { doc: 'MUAP', row: 'Total Plafond', ph: '[Terbilang]', label: '[Plafond Terbilang]' },
  { doc: 'MUAP', row: 'Tujuan Permohonan Pembiayaan', ph: '[Deskripsi tujuan penggunaan pembiayaan yang dimohon nasabah]', label: '[Tujuan Pembiayaan]' },
  { doc: 'MUAP', row: 'Akad yang Digunakan', ph: '[Murabahah / Musyarakah / Ijarah / IMBT / Istishna / Salam]', label: '[Jenis Akad]' },
  // ── RSK ──
  { doc: 'RSK', row: 'Tanggal', ph: '[Tanggal Bulan Tahun]', label: '[Tanggal RSK]' },
  { doc: 'RSK', row: 'Nama Nasabah', ph: '[Nama Nasabah / Perusahaan]', label: '[Nama Perusahaan Pemohon]' },
  { doc: 'RSK', row: 'Nama Nasabah / Pemohon', ph: '[Nama Perusahaan / Individu]', label: '[Nama Perusahaan Pemohon]' },
  { doc: 'RSK', row: 'Total Pembiayaan', ph: '[xxx.xxx.xxx]', label: '[Plafond yang Diajukan]' },
  { doc: 'RSK', row: 'Total Plafond Diusulkan', ph: '[xxx.xxx.xxx]', label: '[Plafond yang Diajukan]' },
  { doc: 'RSK', row: 'Total Plafond Diusulkan', ph: '[terbilang]', label: '[Plafond Terbilang]' },
  { doc: 'RSK', row: 'Jangka Waktu Plafond', ph: '[X]', label: '[Jangka Waktu]' },
  { doc: 'RSK', row: 'Total Nilai Agunan Likuidasi', ph: '[Rp X]', label: '[Nilai Agunan]' },
  { doc: 'RSK', row: 'Akad yang Diusulkan', ph: '[Musyarakah / Murabahah / Ijarah / Istishna / dll.]', label: '[Jenis Akad]' },
  { doc: 'RSK', row: 'Tarif / Nisbah Bagi Hasil', ph: '[Ekv. X% p.a. / Nisbah Bank:Nasabah = X:Y]', label: '[Margin/Nisbah]' },
]

function cellText(cell: docs_v1.Schema$TableCell): string {
  let t = ''
  for (const el of cell.content ?? []) for (const pe of el.paragraph?.elements ?? []) t += pe.textRun?.content ?? ''
  return t.replace(/\s+/g, ' ').trim().slice(0, 50)
}

interface Hit { start: number; end: number; ph: string; row: string }
function collect(content: docs_v1.Schema$StructuralElement[] | undefined, row: string, hits: Hit[]): void {
  for (const el of content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      const c = pe.textRun?.content ?? ''
      const s = pe.startIndex ?? -1
      if (s < 0) continue
      for (const m of c.matchAll(/\[[^\]\n]{1,160}\]/g)) {
        const start = s + (m.index ?? 0)
        hits.push({ start, end: start + m[0].length, ph: m[0].trim(), row })
      }
    }
    for (const r of el.table?.tableRows ?? []) {
      const cells = r.tableCells ?? []
      const label = cells.length ? cellText(cells[0]) : ''
      for (const cell of cells) collect(cell.content ?? undefined, label || row, hits)
    }
  }
}

for (const [label, id] of Object.entries(DOC_ID)) {
  const doc = (await docs.documents.get({ documentId: id })).data
  const hits: Hit[] = []
  collect(doc.body?.content ?? undefined, '', hits)
  const planned: Hit[] = []
  const requests: docs_v1.Schema$Request[] = []
  for (const e of MAP.filter((m) => m.doc === label)) {
    const matches = hits.filter((h) => h.ph === e.ph && h.row.includes(e.row))
    if (matches.length === 0) { console.log(`  ⚠ NO MATCH  ${e.row} · ${e.ph}`); continue }
    for (const h of matches) planned.push({ ...h, ph: e.label })
  }
  planned.sort((a, b) => b.start - a.start) // descending so indices stay valid
  for (const p of planned) {
    requests.push({ deleteContentRange: { range: { startIndex: p.start, endIndex: p.end } } })
    requests.push({ insertText: { location: { index: p.start }, text: p.ph } })
  }
  console.log(`\n===== ${label} — ${planned.length} placement(s) ${APPLY ? '[APPLYING]' : '[dry]'} =====`)
  for (const p of [...planned].sort((a, b) => a.start - b.start)) console.log(`  ${String(p.start).padStart(6)}  → ${p.ph}`)
  if (APPLY && requests.length) {
    await docs.documents.batchUpdate({ documentId: id, requestBody: { requests } })
    console.log(`  ✓ applied ${requests.length / 2} replacements`)
  }
}
