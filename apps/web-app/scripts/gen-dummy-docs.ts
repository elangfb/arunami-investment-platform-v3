// Generate the dummy-data folders used for end-to-end manual testing of the Mizan flow.
//
// For every persona in src/lib/dummy-data/personas.ts this writes resources/dummy-data/<slug>/:
//   • application.txt — copy-paste cheat-sheet for /applications/new + the Data-tab financials
//   • nasabah.txt     — the applicant's identity/contact card
//   • dokumen/*.pdf   — one real PDF per required document (drag-drop into the Documents tab)
//
// The persona module is the single source of truth; this script is a pure renderer. Re-run after
// editing a persona or the required-docs matrix. The PDFs are real text-layer PDFs that pass the
// upload byte-validation and OCR back the gate values under a real provider.
//
// Run:  pnpm gen:dummy   (or: pnpm exec tsx apps/web-app/scripts/gen-dummy-docs.ts)

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DUMMY_PERSONAS, docContent, personaDocs, personaHardGates, type DummyPersona } from '../src/lib/dummy-data/personas'
import { renderTextPdf } from '../src/lib/dummy-data/pdf'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '../../..')
const OUT_DIR = resolve(REPO_ROOT, 'resources/dummy-data')

const NASABAH_LABEL = { business: 'Bisnis', individual: 'Individu' } as const
const COLLATERAL_LABEL = { none: 'Tanpa Agunan', fixed_asset: 'Properti / Tanah', vehicle: 'Kendaraan', guarantor: 'Jaminan Perorangan' } as const
const INCOME_LABEL = { karyawan: 'Karyawan', wiraswasta: 'Wiraswasta' } as const

// Rupiah formatting, lockstep with what the cheat-sheet reader types back into the form.
const idr = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

function applicationSheet(p: DummyPersona): string {
  const gates = personaHardGates(p)
  const docs = personaDocs(p)
  const isIndividual = p.nasabahType === 'individual'
  const lines = [
    `# ${p.label}`,
    '# Data dummy untuk uji coba alur Mizan end-to-end.',
    '# Dihasilkan oleh `pnpm gen:dummy` (sumber: apps/web-app/src/lib/dummy-data/personas.ts).',
    '# JANGAN diedit manual — perubahan akan tertimpa saat regenerate.',
    '',
    '== FORMULIR APLIKASI (/applications/new) ==',
    `Jenis Nasabah        : ${NASABAH_LABEL[p.nasabahType]}`,
    `Nama Nasabah         : ${p.nasabahName}`,
    `Nama Usaha           : ${p.namaUsaha || '-'}`,
    `No. Telepon          : ${p.phoneNumber}`,
    `WhatsApp             : ${p.whatsappNumber === p.phoneNumber ? 'sama dengan telepon' : p.whatsappNumber}`,
    ...(isIndividual
      ? [
          `Sumber Penghasilan   : ${INCOME_LABEL[p.incomeSource]}`,
          `Status Pernikahan    : ${p.isMarried ? 'Sudah Menikah' : 'Belum Menikah'}`,
        ]
      : []),
    `Jenis Akad           : ${p.akadType}`,
    `Plafond              : ${idr(p.requestedPlafond)}`,
    `Tenor                : ${p.requestedTenorMonths} bulan`,
    `Tujuan Pembiayaan    : ${p.purpose}`,
    `Jenis Agunan         : ${COLLATERAL_LABEL[p.collateralType]}`,
    '',
    '== INPUT KEUANGAN (tab Data, Stage 3) ==',
    `NIK (konfirmasi KTP)         : ${p.nik}`,
    `Pendapatan Bersih / bln      : ${idr(p.netMonthlyIncome)}`,
    `Kewajiban Bulanan Berjalan   : ${idr(p.existingMonthlyObligations)}`,
    `Nilai Appraisal Agunan       : ${p.collateralAppraisedValue > 0 ? idr(p.collateralAppraisedValue) : '-'}`,
    `Margin (flat, per tahun)     : ${p.marginRate}%`,
    `Kolektibilitas SLIK          : Kol ${p.kol}`,
    '',
    '== TARGET HARD-GATE (happy path) ==',
    `DSR : ${gates.dsr}%   (maks 40%)`,
    `LTV : ${p.collateralAppraisedValue > 0 ? `${gates.ltv}%` : '-'}   (maks 70%)`,
    `Kol : ${gates.kol}    (maks 1)`,
    '',
    `== DAFTAR DOKUMEN (folder dokumen/, ${docs.length} berkas) ==`,
    ...docs.map((d, i) => `${String(i + 1).padStart(2, '0')}  ${d.name}  [${d.docType}]`),
    '',
  ]
  return lines.join('\n')
}

function nasabahCard(p: DummyPersona): string {
  return [
    `# ${p.label} — Identitas Nasabah (dummy)`,
    '',
    `Nama        : ${p.nasabahName}`,
    `NIK         : ${p.nik}`,
    `Jenis       : ${NASABAH_LABEL[p.nasabahType]}`,
    `Nama Usaha  : ${p.namaUsaha || '-'}`,
    `Telepon     : ${p.phoneNumber}`,
    `WhatsApp    : ${p.whatsappNumber}`,
    'Alamat      : Jl. Merdeka No. 10, Jakarta Pusat (dummy)',
    '',
  ].join('\n')
}

async function generatePersona(p: DummyPersona): Promise<number> {
  const dir = resolve(OUT_DIR, p.slug)
  const docsDir = resolve(dir, 'dokumen')
  await rm(dir, { recursive: true, force: true })
  await mkdir(docsDir, { recursive: true })

  await writeFile(resolve(dir, 'application.txt'), applicationSheet(p))
  await writeFile(resolve(dir, 'nasabah.txt'), nasabahCard(p))

  const docs = personaDocs(p)
  await Promise.all(
    docs.map((doc, i) => {
      const { title, lines } = docContent(p, doc.docType)
      const fileName = `${String(i + 1).padStart(2, '0')}-${doc.docType}.pdf`
      return writeFile(resolve(docsDir, fileName), renderTextPdf(title, lines))
    }),
  )
  return docs.length
}

await mkdir(OUT_DIR, { recursive: true })
for (const p of DUMMY_PERSONAS) {
  const count = await generatePersona(p)
  console.log(`✓ ${relative(REPO_ROOT, resolve(OUT_DIR, p.slug))}  (${count} dokumen)`)
}
console.log(`\nSelesai. ${DUMMY_PERSONAS.length} persona di ${relative(REPO_ROOT, OUT_DIR)}/`)
