import { extractFromDocument } from '@/lib/ocr'
import { formatRupiah } from '@/lib/sla-utils'
import type { OcrProvider, OcrInput } from './provider'

// The default provider: the existing FABRICATED extraction (NIK = hash of app id; income/
// appraisal = arithmetic on plafond). Deterministic, offline, zero-egress — keeps dev + tests
// working with no OCR config. Delegates to lib/ocr.ts so behavior is byte-identical to before
// the abstraction. Replace by setting OCR_PROVIDER to a real provider.
export function stubOcrProvider(): OcrProvider {
  return {
    name: 'stub',
    async extract({ docKind, app }) {
      return extractFromDocument(docKind, app)
    },
    // Deterministic, offline fabrication of plausible full-document text from app context.
    // Lets the OCR-text → narrative pipeline run end-to-end with no cloud config or egress.
    async extractFullText({ docKind, app }) {
      return fabricateDocumentText(docKind, app)
    },
  }
}

function fabricateDocumentText(docKind: string, app: OcrInput['app']): string {
  const subject = app.namaUsaha || app.nasabahName
  const field = extractFromDocument(docKind, app)
  switch (docKind) {
    case 'ktp':
      return [
        'KARTU TANDA PENDUDUK',
        `NIK: ${field?.value ?? '-'}`,
        `Nama: ${app.nasabahName}`,
        `Pekerjaan: ${app.nasabahType === 'business' ? 'Wiraswasta' : 'Karyawan Swasta'}`,
        'Kewarganegaraan: WNI',
      ].join('\n')
    case 'slik_report':
      return [
        'LAPORAN SLIK — OTORITAS JASA KEUANGAN',
        `Debitur: ${subject}`,
        `Kolektibilitas terkini: Kol ${field?.value ?? '-'}`,
        'Riwayat pembayaran 12 bulan terakhir: lancar.',
        'Fasilitas aktif di lembaga lain: tidak ada catatan tunggakan.',
      ].join('\n')
    case 'slip_gaji':
      return [
        'SLIP GAJI / BUKTI PENGHASILAN',
        `Nama: ${app.nasabahName}`,
        `Penghasilan bersih per bulan: ${formatRupiah(Number(field?.value ?? 0))}`,
        'Komponen: gaji pokok + tunjangan tetap, dikurangi potongan.',
      ].join('\n')
    case 'laporan_keuangan': {
      const income = Math.round((app.requestedPlafond / app.requestedTenorMonths) * 3 / 100000) * 100000
      return [
        'LAPORAN KEUANGAN - LABA RUGI',
        `Nama Usaha: ${subject}`,
        `Pendapatan usaha (omzet) per bulan: ${formatRupiah(income * 4)}`,
        `Laba bersih per bulan: ${formatRupiah(income)}`,
      ].join('\n')
    }
    case 'appraisal_agunan':
      return [
        'LAPORAN PENILAIAN AGUNAN (APPRAISAL)',
        `Pemohon: ${subject}`,
        `Nilai pasar wajar agunan: ${formatRupiah(Number(field?.value ?? 0))}`,
        'Jenis agunan: aset tetap. Status: bersertifikat, layak dijaminkan.',
      ].join('\n')
    default:
      // Any other uploaded document still gets transcribable text (for narrative grounding).
      return [`DOKUMEN: ${docKind}`, `Nasabah: ${subject}`].join('\n')
  }
}
