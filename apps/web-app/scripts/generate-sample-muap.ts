/* eslint-disable @typescript-eslint/no-explicit-any -- one-off standalone sample generator over Google Docs JSON */
// Generate a SAMPLE filled MUAP from the master (a throwaway files.copy — the master is never touched),
// to live-verify the fill incl. the Batch 9 identity bindings ([Nomor NPWP]/[Nomor NIB]/[Alamat Sesuai
// Dokumen Legalitas]/[Bidang Usaha Utama]) + the V3.5 NamedRange slots. No app imports (server-only).
//   cd apps/web-app && set -a; . .env.local; set +a; pnpm exec tsx scripts/generate-sample-muap.ts <outDir>
import { google } from 'googleapis'

const MASTER = process.env.GOOGLE_MASTER_MUAP_DOC_ID ?? '1rydh9HpZhdWUAgCWJLhMS10CCgdCMnY6fTSZji7eljg'

function clients() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return { docs: google.docs({ version: 'v1', auth: c }), drive: google.drive({ version: 'v3', auth: c }) }
}

// Sample fill — [bracket] tokens (replaceAllText). Identity additions marked ★ (Batch 9).
const BRACKETS: Record<string, string> = {
  '[No. Aplikasi]': 'FOS-2026-099',
  '[Nama Perusahaan Pemohon]': 'CV Berkah Jaya',
  '[Nama Lengkap Perusahaan]': 'CV Berkah Jaya',
  '[Nama Nasabah]': 'Budi Santoso',
  '[Jenis Nasabah]': 'Badan Usaha',
  '[Jenis Akad]': 'Murabahah',
  '[Plafond yang Diajukan]': 'Rp 500.000.000',
  '[Plafond Terbilang]': 'lima ratus juta rupiah',
  '[Jangka Waktu]': '24 bulan',
  '[Tujuan Pembiayaan]': 'Modal kerja — pembelian persediaan',
  '[Nomor NPWP]': '09.254.294.3-407.000', // ★
  '[Nomor NIB]': '1234567890123', // ★
  '[Alamat Sesuai Dokumen Legalitas]': 'Jl. Merdeka No. 10, Jakarta Pusat', // ★
  '[Bidang Usaha Utama]': 'Perdagangan Besar', // ★
  '[DSR]': '30%',
  '[LTV]': '60%',
  '[Kolektibilitas]': 'Kol 1',
  '[Jenis Agunan Utama]': 'Tanah & Bangunan',
  '[Nilai Agunan]': 'Rp 800.000.000',
  '[Pendapatan Bersih per Bulan]': 'Rp 20.000.000',
  '[Kewajiban Existing per Bulan]': 'Rp 2.000.000',
  '[Angsuran per Bulan]': 'Rp 5.000.000',
  '[Margin/Nisbah]': '12%',
  '[Jenis Imbal Hasil]': 'Margin',
  '[Nama RM]': 'Siti Rahma',
  '[Tanggal Pengajuan]': '1 Juni 2026',
  '[Tanggal MUAP]': '15 Juni 2026',
  '[Ringkasan Usulan]': 'Pengajuan modal kerja Murabahah Rp 500 juta, tenor 24 bulan, untuk pembelian persediaan dagang.',
}
// V3.5 NamedRange slots (underscore blanks) → fill after replaceAllText (indices shift first).
const RANGES: Record<string, string> = {
  muap_plafond_facility: '500.000.000',
  muap_plafond_recommendation: '500.000.000',
  muap_tenor: '24',
  muap_no_muap_cover: '099/MUAP-MKT/VI/2026',
  muap_no_muap_identitas: '099/MUAP-MKT/VI/2026',
  muap_tanggal_cover: '15 Juni 2026',
  muap_tanggal_identitas: '15 Juni 2026',
}

async function main() {
  const { docs, drive } = clients()
  // 1. Copy the master (throwaway sample — master untouched).
  const copy = await drive.files.copy({ fileId: MASTER, requestBody: { name: 'CONTOH MUAP — CV Berkah Jaya (sample, hapus setelah review)' }, fields: 'id' })
  const docId = copy.data.id!
  console.log(`[sample] copied master → ${docId}`)

  // 2. replaceAllText for every bracket.
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests: Object.entries(BRACKETS).map(([text, replaceText]) => ({ replaceAllText: { containsText: { text, matchCase: true }, replaceText } })) },
  })
  console.log(`[sample] filled ${Object.keys(BRACKETS).length} [bracket] tokens (incl. NPWP/NIB/Alamat/Bidang Usaha)`)

  // 3. Re-read namedRanges (indices shifted by step 2), fill each V3.5 range end→start.
  const after = (await docs.documents.get({ documentId: docId, fields: 'namedRanges' })).data
  const nr = after.namedRanges ?? {}
  const fills: { startIndex: number; endIndex: number; text: string }[] = []
  for (const [name, text] of Object.entries(RANGES)) {
    for (const r of nr[name]?.namedRanges ?? []) {
      for (const range of r.ranges ?? []) {
        if (range.startIndex != null && range.endIndex != null) fills.push({ startIndex: range.startIndex, endIndex: range.endIndex, text })
      }
    }
  }
  fills.sort((a, b) => b.startIndex - a.startIndex) // descending → earlier indices stay valid
  const reqs: any[] = []
  for (const f of fills) {
    if (f.endIndex > f.startIndex) reqs.push({ deleteContentRange: { range: { startIndex: f.startIndex, endIndex: f.endIndex } } })
    reqs.push({ insertText: { location: { index: f.startIndex }, text: f.text } })
  }
  if (reqs.length) await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: reqs } })
  console.log(`[sample] filled ${fills.length} V3.5 NamedRange slot(s)`)

  // 4. Export PDF for inspection.
  const outDir = process.argv[2] || '.tt/template-audit'
  const { writeFileSync } = await import('node:fs')
  const pdf = await drive.files.export({ fileId: docId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' })
  writeFileSync(`${outDir}/sample-muap.pdf`, Buffer.from(pdf.data as ArrayBuffer))
  console.log(`[sample] exported → ${outDir}/sample-muap.pdf`)
  console.log(`[sample] OPEN: https://docs.google.com/document/d/${docId}/edit`)
}
void main()
