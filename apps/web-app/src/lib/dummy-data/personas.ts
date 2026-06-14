// Authored dummy personas for end-to-end manual testing of the Mizan origination flow.
//
// Each persona is ONE coherent applicant: intake fields (what the RM types on /applications/new),
// financial inputs (what the analyst enters on the Data tab), and the content printed onto every
// required document. The numbers are hand-tuned so DSR/LTV/Kol land inside the active hard-gate
// policy (verified in personas.test.ts) — a run stays on the happy path without fudging.
//
// `scripts/gen-dummy-docs.ts` renders these into resources/dummy-data/<slug>/ (cheat-sheets +
// real PDFs). This module is the single source of truth; never hand-edit the generated folder.
//
// NOTE: with OCR_PROVIDER=stub (default dev) the uploaded bytes are ignored and gate values are
// fabricated from the app — the document CONTENT only matters under a real provider
// (documentai/gemini). The cheat-sheet values are always authoritative for the human tester.

import type { AkadType, CollateralType, HardGates, IncomeSource } from '@/lib/types'
import { buildRequiredDocuments } from '@/lib/required-docs'
import { computeHardGates } from '@/lib/financials'

export interface DummyPersona {
  /** Folder name under resources/dummy-data/. */
  slug: string
  /** Human title for the cheat-sheet header. */
  label: string

  // ── Intake (mirrors createApplicationAction input + RequiredDocsInput) ──
  nasabahType: 'individual' | 'business'
  nasabahName: string
  /** Business only; '' for individuals. */
  namaUsaha: string
  /** Authoritative 16-digit NIK printed on the KTP and confirmed by the tester. */
  nik: string
  phoneNumber: string
  whatsappNumber: string
  akadType: AkadType
  collateralType: CollateralType
  incomeSource: IncomeSource
  isMarried: boolean
  requestedPlafond: number
  requestedTenorMonths: number
  purpose: string

  // ── Financial inputs (Data tab) — gate-safe by construction ──
  netMonthlyIncome: number
  existingMonthlyObligations: number
  /** 0 when the persona has no collateral (LTV gate then N/A). */
  collateralAppraisedValue: number
  /** Flat-akad annual margin % (Murabahah/Ijarah). */
  marginRate: number
  /** SLIK collectibility (1 = lancar). */
  kol: number
}

export const DUMMY_PERSONAS: DummyPersona[] = [
  {
    slug: 'cv-berkah-mandiri',
    label: 'CV Berkah Mandiri — Bisnis · Murabahah · Agunan Properti',
    nasabahType: 'business',
    nasabahName: 'CV Berkah Mandiri',
    namaUsaha: 'Toko Bangunan Berkah Mandiri',
    nik: '3174012503850002',
    phoneNumber: '081234567890',
    whatsappNumber: '081234567890',
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    incomeSource: 'wiraswasta',
    isMarried: false,
    requestedPlafond: 250_000_000,
    requestedTenorMonths: 36,
    purpose: 'Modal kerja pengadaan stok material bangunan untuk ekspansi cabang kedua.',
    netMonthlyIncome: 35_000_000,
    existingMonthlyObligations: 3_000_000,
    collateralAppraisedValue: 400_000_000,
    marginRate: 12,
    kol: 1,
  },
  {
    slug: 'andi-pratama',
    label: 'Andi Pratama — Individu · Murabahah · Tanpa Agunan',
    nasabahType: 'individual',
    nasabahName: 'Andi Pratama',
    namaUsaha: '',
    nik: '3173052007900003',
    phoneNumber: '081298765432',
    whatsappNumber: '081298765432',
    akadType: 'Murabahah',
    collateralType: 'none',
    incomeSource: 'karyawan',
    isMarried: false,
    requestedPlafond: 60_000_000,
    requestedTenorMonths: 24,
    purpose: 'Pembelian perlengkapan dan renovasi dapur rumah tinggal.',
    netMonthlyIncome: 12_000_000,
    existingMonthlyObligations: 1_000_000,
    collateralAppraisedValue: 0,
    marginRate: 12,
    kol: 1,
  },
]

export interface PersonaDoc {
  docType: string
  name: string
}

/**
 * The full document set a tester must provide for a persona: the Stage-1 required docs derived
 * from the live matrix (lib/required-docs) PLUS the Stage-2 bureau pulls (SLIK/Pefindo), which
 * the Stage-1 builder intentionally omits but the E2E run needs for the Kol gate.
 */
export function personaDocs(p: DummyPersona): PersonaDoc[] {
  const required = buildRequiredDocuments(
    {
      nasabahType: p.nasabahType,
      akadType: p.akadType,
      isMarried: p.isMarried,
      incomeSource: p.incomeSource,
      collateralType: p.collateralType,
    },
    p.slug,
  ).map((d) => ({ docType: d.docType, name: d.name }))
  return [
    ...required,
    { docType: 'slik_report', name: 'Laporan SLIK (OJK)' },
    { docType: 'pefindo_report', name: 'Laporan Pefindo' },
  ]
}

/** Computed hard-gate ratios for a persona — used by the test guard and the cheat-sheet. */
export function personaHardGates(p: DummyPersona): HardGates {
  const { dsr, ltv } = computeHardGates({
    requestedPlafond: p.requestedPlafond,
    requestedTenorMonths: p.requestedTenorMonths,
    akadType: p.akadType,
    netMonthlyIncome: p.netMonthlyIncome,
    existingMonthlyObligations: p.existingMonthlyObligations,
    collateralAppraisedValue: p.collateralAppraisedValue,
    marginRate: p.marginRate,
  })
  return { dsr, ltv, kol: p.kol }
}

// Indonesian Rupiah with '.' thousands separators — must match what parseGateValueFromText
// (lib/ocr.ts) expects to read back off the gate documents. Lockstep across every money line.
function rupiah(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID')
}

/**
 * The title + body lines printed onto a persona's document of the given type. Gate documents
 * (ktp / slik_report / slip_gaji / laporan_keuangan / appraisal_agunan) carry the persona's
 * authored values in the exact phrasing parseGateValueFromText reads; every other document gets
 * plausible filler so the upload + preview look real.
 */
export function docContent(p: DummyPersona, docType: string): { title: string; lines: string[] } {
  const subject = p.namaUsaha || p.nasabahName
  switch (docType) {
    case 'ktp':
    case 'ktp_pengurus':
      return {
        title: 'KARTU TANDA PENDUDUK',
        lines: [
          `NIK : ${p.nik}`,
          `Nama : ${p.nasabahName}`,
          'Tempat/Tgl Lahir : JAKARTA, 25-03-1985',
          'Jenis Kelamin : LAKI-LAKI',
          `Pekerjaan : ${p.nasabahType === 'business' ? 'WIRASWASTA' : 'KARYAWAN SWASTA'}`,
          'Kewarganegaraan : WNI',
        ],
      }
    case 'slik_report':
      return {
        title: 'LAPORAN SLIK - OTORITAS JASA KEUANGAN',
        lines: [
          `Debitur : ${subject}`,
          `Kolektibilitas terkini : Kol ${p.kol}`,
          'Riwayat pembayaran 12 bulan terakhir : lancar.',
          'Fasilitas aktif di lembaga lain : tidak ada catatan tunggakan.',
        ],
      }
    case 'pefindo_report':
      return {
        title: 'LAPORAN PEFINDO - BIRO KREDIT',
        lines: [`Debitur : ${subject}`, 'Skor kredit : 720 (baik)', 'Tidak ada tunggakan aktif.'],
      }
    case 'slip_gaji':
      return {
        title: 'SLIP GAJI / BUKTI PENGHASILAN',
        lines: [
          `Nama : ${p.nasabahName}`,
          `Penghasilan bersih per bulan : ${rupiah(p.netMonthlyIncome)}`,
          'Komponen : gaji pokok + tunjangan tetap, dikurangi potongan.',
        ],
      }
    case 'laporan_keuangan':
    case 'laporan_usaha':
      return {
        title: 'LAPORAN KEUANGAN - LABA RUGI',
        lines: [
          `Nama Usaha : ${subject}`,
          `Pendapatan usaha (omzet) per bulan : ${rupiah(p.netMonthlyIncome * 4)}`,
          `Laba bersih per bulan : ${rupiah(p.netMonthlyIncome)}`,
        ],
      }
    case 'appraisal_agunan':
      return {
        title: 'LAPORAN PENILAIAN AGUNAN (APPRAISAL)',
        lines: [
          `Pemohon : ${subject}`,
          `Nilai pasar wajar agunan : ${rupiah(p.collateralAppraisedValue)}`,
          'Jenis agunan : aset tetap, bersertifikat, layak dijaminkan.',
        ],
      }
    case 'npwp':
      return { title: 'NPWP', lines: [`Nama : ${subject}`, 'NPWP : 09.254.294.8-407.000'] }
    default:
      return { title: 'DOKUMEN CONTOH (DUMMY)', lines: [`Jenis dokumen : ${docType}`, `Nasabah : ${subject}`] }
  }
}
