// author-momsp3-masters.ts — de-customize the MoM + SP3 master templates (copies of the real filled
// reference docs) into reusable templates: Mizan-known fields → {{token}} (names matching
// mom-sp3-tokens.ts so generateMomSp3Doc fills them), customer-specific data → [human placeholder],
// generic legal boilerplate kept verbatim. Re-runnable: replaceAllText is idempotent once applied
// (0 further matches). A denylist scan after apply PROVES no example-customer data leaked.
//
// Dense customer paragraphs are matched by their EXACT text read from /tmp/ref-<doc>.txt (produced by
// _export-momsp3-text.ts) so the match is guaranteed against the copied master.
//
//   cd apps/web-app && set -a; . .env.local; set +a; \
//     DOC=sp3 [APPLY=1] TSX_TSCONFIG_PATH=tsconfig.json node --import tsx scripts/author-momsp3-masters.ts
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import type { docs_v1 } from 'googleapis'

const APPLY = process.env.APPLY === '1'
const DOC = (process.env.DOC ?? '') as 'mom' | 'sp3'
const MASTERS = { mom: '1NHCSqxPVHds3GpZB4_FeaWIIgIMdJhONe-fzVzky2Q4', sp3: '1-p1oZdNXSDasSXIJKgvhjKp_Pl3Mkg5c2HEKcV6VACw' }
if (DOC !== 'mom' && DOC !== 'sp3') { console.error('set DOC=mom|sp3'); process.exit(1) }

const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const docs = google.docs({ version: 'v1', auth: oauth2 })

const refLines = readFileSync(`/tmp/ref-${DOC}.txt`, 'utf8').split('\n')
const L = (n: number): string => refLines[n - 1] // 1-indexed to match the file view

// Customer-specific placeholder labels.
const OWNER = '[Nama Pemilik Agunan]'
const AGUNAN = '[Agunan Utama: jenis, luas, lokasi, legalitas (SHM/HGB No.), atas nama pemilik, nilai appraisal — lengkapi sesuai berkas agunan]'
const PENGIKATAN = '[Pengikatan agunan: jenis (SKMHT/APHT/SHT), nomor sertifikat, nilai]'

// [find, replace] applied in order (specific/longer BEFORE shorter substrings).
const sp3Map: Array<[string, string]> = [
  // dense customer paragraphs (exact text from export) → one clean placeholder
  [L(46), AGUNAN],
  [L(56), PENGIKATAN],
  // header No / date
  ['410/BPRS-HA/MKT/VII/2025', '{{sp3_no}}'],
  ['8 Juli 2025', '{{sp3_tanggal}}'],
  // intro: nasabah's permohonan ref + date
  ['02.001/FIN/HJR-WSR/2025', '[No. Surat Permohonan Nasabah]'],
  ['03 Februari 2025', '[tanggal surat permohonan]'],
  // header address
  ['Jalan Wana Mulya Utama No. 3', '{{nasabah_alamat}}'],
  ['Karang Mulya, Karang Tengah, Kota Tangerang, Provinsi Banten, Kode Pos 15157', '[Kota / Kode Pos]'],
  // Mizan-known terms
  ['Rp 2.000.000.000,- (dua miliar rupiah)', '{{sp3_plafond}}'],
  ['Maksimal 12 bulan sejak penandatanganan akad', 'Maksimal {{sp3_tenor}} sejak penandatanganan akad'],
  ['Eq. 17% eff pa', '{{sp3_imbal_hasil}}'],
  ['1. Musyarakah (Pre Financing)', '{{sp3_akad}}'],
  ['2. Wakalah Bil Ujrah dan Qardh (Post Financing)', '[Akad pelengkap bila ada]'],
  [': Revolving', ': {{sp3_sifat}}'],
  ['laporan keuangan 2022', 'laporan keuangan [tahun audit]'],
  // signatories
  ['Setyo Prabowo', '[Nama Pejabat Bank]'],
  ['Agvin Hadiatma', '[Nama Penandatangan Nasabah]'],
  // stray owner names (mostly already gone via the agunan paragraph replace)
  ['Muhartini, SH', OWNER], ['Agri Rahadiyan Cahyanto', OWNER], ['Agni Hadieta Cahyanti', OWNER],
  // company name (after agunan replace removed the embedded ones) — longer first
  ['PT Pramudya Tata Laksana', '{{nasabah_nama}}'],
  ['Pramudya Tata Laksana', '{{nasabah_nama}}'],
]

// MoM data cells that are per-case committee discussion (deviation + recommendation tables) — emptied
// so the template ships a blank fillable grid (the committee fills them live), plus FORM disposisi.
const EMPTY_MOM = [
  63, 64, 65, 66, 68, 69, 70, 71, // Hal-Hal Memerlukan Persetujuan Khusus (deviasi)
  79, 80, 81, 83, 84, 85, 87, 88, 89, 91, 92, 93, 94, 96, 97, 98, 100, 101, 102, 104, 105, 107, 108, 109, 111, 112, // Rekomendasi Unit Risk
  328, 342, 343, 344, // FORM: keterangan + disposisi
]
const momMap: Array<[string, string]> = [
  // dense customer paragraphs → clean placeholder
  [L(161), AGUNAN],
  [L(171), PENGIKATAN],
  // per-case discussion cells → empty (maker fills live)
  ...EMPTY_MOM.map((n) => [L(n), ''] as [string, string]),
  // plafond (terbilang variants BEFORE the bare form in the FORM table)
  ['Rp 2.000.000.000,- (dua miliar rupiah)', '{{mom_plafond}}'],
  ['Rp 2.000.000.000,- (dua  miliar rupiah)', '{{mom_plafond}}'],
  // underlying doc refs (Mizan-known) → token
  ['084/MUAP-MKT/VI/2025', '{{mom_muap_ref}}'],
  ['034/RSK-DF/VI/2025', '{{mom_rsk_ref}}'],
  // header date + location
  ['Jan 15, 2025', '{{mom_tanggal}}'],
  [L(9), '{{mom_lokasi}}'],
  // dates (longer/more-specific BEFORE shorter)
  ['18 Januari  2025', '[tanggal komite]'],
  ['14 April 2025', '[tanggal surat permohonan]'],
  ['5 Juni 2025', '[tanggal MUAP]'],
  ['13 Juni 2025', '[tanggal Risk Review]'],
  ['Juni 2025', '[bulan tahun]'],
  ['I/XIV/25/PRM/HJR/JKT', '[No. Surat Permohonan Nasabah]'],
  // tenor + akad
  ['Maksimal 12 bulan sejak penandatanganan akad', 'Maksimal {{mom_tenor}} sejak penandatanganan akad'],
  ['1. Musyarakah', '{{mom_akad}}'],
  ['2. Wakalah Bil Ujrah dan Qardh', '[Akad pelengkap bila ada]'],
  ['2. Wakalah Bil Ujrah', '[Akad pelengkap bila ada]'],
  // imbal / rate (placeholder — no MoM token for these)
  ['Eq. 15% eff pa', '[imbal hasil usulan]'],
  ['Minimal eq. 16% eff pa', '[imbal hasil rekomendasi]'],
  ['Minimal rate 16%', '[rate rekomendasi]'],
  // meeting times
  ['5.30 AM', '[waktu mulai]'],
  ['7.00 AM', '[waktu selesai]'],
  // committee/attendee names (longer first)
  ['Rona Jutama Yonanda', '[Nama Anggota Komite]'],
  ['Ade Wikasyah', '[Nama Anggota Komite]'],
  ['Tri Suharmanto', '[Nama Peserta]'],
  ['Fita Maulya Ningsih', '[Nama Peserta]'],
  ['Fita Maulya', '[Nama Peserta]'],
  ['Annisa Handayani', '[Nama Peserta]'],
  ['Yulinar R', '[Nama Peserta]'],
  // agunan facility lines
  ['Rumah Tinggal dengan legalitas SHM No. 04017', '[Agunan utama]'],
  ['atas nama Agvin Hadiatma, Muhartini,', ''],
  ['Agri Rahadiyan,Cahyanto, Agni Hadieta Cahyanti.', ''],
  // stray owner names + SHM + amounts (most already gone via empties/paragraphs)
  ['Agvin Hadiatma', OWNER], ['Agri Rahadiyan Cahyanto', OWNER], ['Agni Hadieta Cahyanti', OWNER],
  ['Muhartini', OWNER], ['Cahyanto', OWNER],
  ['SHM No. 04017', 'SHM No. [nomor sertifikat]'],
  ['Rp. 1.922.165.000,-', '[nilai agunan]'],
  ['Rp. 1.900.000.000,- (satu milyar sembilan ratus juta rupiah)', '[plafond rekomendasi risk]'],
  ['1,9 miliar', '[nilai]'], ['Rp 2 Milyar', '[plafond]'], ['Rp. 2,5 Milyar', '[nilai]'],
  ['laporan keuangan 2022', 'laporan keuangan [tahun audit]'],
  // bare plafond (FORM) — after the terbilang variants above
  ['Rp 2.000.000.000,-', '{{mom_plafond}}'],
  // company name (last; longer first). 4 of 6 mentions carry a stray private-use glyph (U+E907)
  // between "PT " and the name, so match that variant first; consume the "PT" prefix into the token
  // (mom_nasabah already includes the entity prefix) to avoid a double "PT" at fill time.
  ['PT \uE907Pramudya Tata Laksana', '{{mom_nasabah}}'],
  ['PT Pramudya Tata Laksana', '{{mom_nasabah}}'],
  ['Pramudya Tata Laksana', '{{mom_nasabah}}'],
  ['PT PTL', '{{mom_nasabah}}'],
  ['PTL', '{{mom_nasabah}}'],
]

const maps: Record<'mom' | 'sp3', Array<[string, string]>> = { sp3: sp3Map, mom: momMap }

// Markers that MUST NOT survive de-customization (any hit = example-customer leak).
const DENY: RegExp[] = [
  /Pramudya/i, /\bPTL\b/, /Agvin/i, /Muhartini/i, /Agri Rahadiyan/i, /Cahyanto/i, /Cahyanti/i, /Agni/i,
  /Setyo/i, /Prabowo/i, /Wana Mulya/i, /Karang Mulya/i, /Karang Tengah/i, /Puri Primacom/i, /Cinangka/i,
  /Sawangan/i, /\bDepok\b/i, /04017/, /167 m2/, /118,5/, /1\.930\.515\.000/, /2\.000\.000\.000/, /dua miliar/i,
  /8 Juli 2025/, /03 Februari 2025/, /17% eff/, /BPRS-HA\/MKT/, /02\.001\/FIN/, /HJR-WSR/, /laporan keuangan 2022/,
  // MoM-only
  /Rona/i, /Wikasyah/i, /Suharmanto/i, /Maulya/i, /Annisa/i, /Handayani/i, /Yulinar/i, /15157/,
  /MUAP-MKT/, /RSK-DF/, /PRM\/HJR/, /Jan 15, 2025/, /1\.900\.000\.000/, /1,9 miliar/,
  /1\.922\.165\.000/, /2,5 Milyar/, /Rp 2 Milyar/, /5\.30 AM/, /7\.00 AM/, /1[56]% eff/, /Minimal rate 16/,
  /Juni 2025/, /April 2025/, /Januari 2025/, /Modal Kerja Pemenuhan Tenaga Kerja/,
]

function allText(content: docs_v1.Schema$StructuralElement[] | undefined, out: string[]): void {
  for (const el of content ?? []) {
    if (el.paragraph) out.push((el.paragraph.elements ?? []).map((pe) => pe.textRun?.content ?? '').join(''))
    for (const r of el.table?.tableRows ?? []) for (const c of r.tableCells ?? []) allText(c.content ?? undefined, out)
  }
}
async function readText(id: string): Promise<string> {
  const doc = (await docs.documents.get({ documentId: id })).data
  const out: string[] = []
  allText(doc.body?.content ?? undefined, out)
  return out.join('\n')
}

const id = MASTERS[DOC]
const map = maps[DOC]
const before = await readText(id)
console.log(`=== ${DOC.toUpperCase()} (${id}) — ${map.length} replacements ===`)
for (const [find, rep] of map) {
  const count = before.split(find).length - 1
  console.log(`  ${count === 0 ? '·' : count}× ${JSON.stringify(find.slice(0, 50))} → ${JSON.stringify(rep.slice(0, 40))}`)
}

if (APPLY) {
  const requests = map.map(([find, rep]) => ({ replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: rep } }))
  await docs.documents.batchUpdate({ documentId: id, requestBody: { requests } })
  console.log('✓ applied')
}

// Scan (always, post-apply on APPLY runs).
const after = await readText(id)
const hits = DENY.filter((re) => re.test(after)).map((re) => re.source)
const leakLines = after.split('\n').filter((ln) => DENY.some((re) => re.test(ln)))
console.log(`\nDENYLIST SCAN: ${hits.length === 0 ? 'CLEAN ✓' : `LEAKS ✗ ${JSON.stringify(hits)}`}`)
for (const ln of leakLines.slice(0, 15)) console.log(`  LEAK: ${JSON.stringify(ln.trim().slice(0, 110))}`)
const tokens = [...after.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
console.log(`tokens present: ${JSON.stringify([...new Set(tokens)])}`)
