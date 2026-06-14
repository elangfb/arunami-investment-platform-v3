import type { LoanApplication } from './types'

export interface OcrExtraction {
  field: string
  label: string
  value: string | number
}

const SUPPORTED_DOC_TYPES = new Set(['ktp', 'slik_report', 'slip_gaji', 'appraisal_agunan'])

export function canExtract(docType: string): boolean {
  return SUPPORTED_DOC_TYPES.has(docType)
}

export function extractFromDocument(
  docType: string,
  app: LoanApplication,
): OcrExtraction | null {
  switch (docType) {
    case 'ktp':
      return { field: 'nik', label: 'NIK', value: extractNik(app) }
    case 'slik_report':
      return { field: 'hardGates.kol', label: 'Kolektibilitas', value: app.hardGates.kol }
    case 'slip_gaji':
      return {
        field: 'financialInputs.netMonthlyIncome',
        label: 'Penghasilan Bersih per Bulan',
        value: Math.round((app.requestedPlafond / app.requestedTenorMonths) * 3 / 100000) * 100000,
      }
    case 'appraisal_agunan':
      return {
        field: 'financialInputs.collateralAppraisedValue',
        label: 'Nilai Appraisal Agunan',
        value: Math.round((app.requestedPlafond * 1.6) / 1000000) * 1000000,
      }
    default:
      return null
  }
}

function extractNik(app: LoanApplication): string {
  let seed = 0
  for (const ch of app.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  return String(seed).padStart(16, '0').slice(-16)
}

// ── Gate-input parsing from OCR text (Slice 2b) ──────────────────────────────────
// NOTE: this regex path is format-fragile on real scans. When accuracy is insufficient, the
// upgrade is typed structured extraction (Form Parser / Custom Extractor) — see the "2c upgrade
// path" in docs/guides/document-ai-ocr.md. Until then, the human-confirm step is the safety net.
// Parse a hard-gate INPUT suggestion out of a document's OCR'd full text. Deterministic
// and CONSERVATIVE: returns null when not confidently found, so the field falls back to
// manual entry rather than a fabricated number. The result is always a human-confirmed
// SUGGESTION (extractionSources → ocr_suggested), never an authoritative gate value — the
// system still computes DSR/LTV/Kol itself and the analyst confirms/overrides.
//   slik_report      → Kolektibilitas (1–5)
//   slip_gaji        → net monthly income (Rupiah)
//   appraisal_agunan → appraised collateral value (Rupiah)
export function parseGateValueFromText(docType: string, text: string): number | null {
  switch (docType) {
    case 'slik_report':
      return parseKol(text)
    case 'slip_gaji':
      return parseRupiahNear(text, /penghasilan|pendapatan|gaji|take[\s-]?home/i)
    case 'laporan_keuangan':
      // Net monthly income from a P&L. Match the NET line only — never bare "pendapatan"
      // (that's revenue/omzet, a much larger number that would wreck DSR).
      return parseRupiahNear(text, /laba bersih|laba usaha bersih|pendapatan bersih/i)
    case 'appraisal_agunan':
      return parseRupiahNear(text, /nilai\s+(?:pasar|wajar|appraisal|taksiran)|appraisal|taksir/i)
    default:
      return null
  }
}

function parseKol(text: string): number | null {
  const m = text.match(/\bkol(?:ektibilitas)?\b[^0-9]{0,25}([1-5])\b/i)
  return m ? Number(m[1]) : null
}

// ── Identity-string parsing from OCR text (Batch 9 — legal-identity expansion) ────
// Same conservative posture as the gate parsers above: a confident match or null (field
// stays manual). Each result is a human-confirmed SUGGESTION (ocr_suggested), never an
// authoritative identity write. These feed the MUAP IDENTITAS HUKUM [bracket] slots.

const NPWP_DOTTED = /\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}/

/** NPWP — the distinctive dotted form anywhere, else 15–16 contiguous digits on an "NPWP" line. */
export function parseNpwp(text: string): string | null {
  const dotted = text.match(NPWP_DOTTED)
  if (dotted) return dotted[0]
  for (const line of text.split('\n')) {
    if (!/npwp/i.test(line)) continue
    const m = line.match(/\b(\d{15,16})\b/)
    if (m) return m[1]
  }
  return null
}

/** NIB — exactly 13 digits on a line mentioning NIB / "Nomor Induk Berusaha". */
export function parseNib(text: string): string | null {
  for (const line of text.split('\n')) {
    if (!/\bnib\b|nomor induk berusaha/i.test(line)) continue
    const m = line.match(/\b(\d{13})\b/)
    if (m) return m[1]
  }
  return null
}

/** Legal address — text after an "Alamat" label up to end of line, with a conservative min
 *  length so a stray "Alamat:" with no value stays manual rather than capturing noise. */
export function parseAddress(text: string): string | null {
  for (const line of text.split('\n')) {
    const m = line.match(/alamat[^:]*:\s*(.+)$/i)
    if (m) {
      const v = m[1].trim()
      if (v.length >= 8) return v
    }
  }
  return null
}

/** Primary business sector — value after a "Bidang/Kegiatan Usaha" / "Sektor" label. */
export function parseSektor(text: string): string | null {
  for (const line of text.split('\n')) {
    const m = line.match(/(?:bidang|kegiatan)\s+usaha[^:]*:\s*(.+)$/i) ?? line.match(/sektor[^:]*:\s*(.+)$/i)
    if (m) {
      const v = m[1].trim()
      if (v.length >= 3) return v
    }
  }
  return null
}

// ── Advisory amount parsing from OCR text (RM-led OCR-widening — design §3) ───────
// These feed ADVISORY-only fields (advisoryExtractions): they are informational + cross-check,
// NEVER a gate input (NIK stays the sole blocker). Same conservative posture as the gate parsers:
// a confident labelled Rupiah amount, or null. HEURISTIC — the Bahasa label sets below are tuned
// on sample TEXT, not on real provider output (the default `stub` OCR FABRICATES from app data),
// so they need real-OCR samples per doc type to tune precision. Each delegates to parseRupiahNear.
//   omzet            (laporan_keuangan)            → 'Omzet'/'Penjualan'/'Pendapatan Usaha'
//   labaBersih       (laporan_keuangan)            → 'Laba Bersih'
//   pendapatanSpt    (spt_tahunan)                 → 'Penghasilan Kena Pajak'/'Penghasilan Neto'
//   saldoRataRata    (rekening_koran_*)            → 'Saldo Rata-rata'
//   bakiDebet        (slik_report)                 → 'Baki Debet'
//   nilaiPasar       (appraisal_agunan)            → 'Nilai Pasar'/'Nilai Wajar'
//   nilaiLikuidasi   (appraisal_agunan)            → 'Nilai Likuidasi'

/** Omzet/revenue from a P&L — the REVENUE top-line (distinct from net income, which the gate
 *  parser reads via 'laba bersih'). Matches 'Omzet'/'Penjualan'/'Pendapatan Usaha'. Advisory. */
export function parseOmzet(text: string): number | null {
  return parseRupiahNear(text, /omzet|penjualan|pendapatan usaha|peredaran bruto/i)
}
/** Net profit (laba bersih) from a P&L — advisory copy of the figure (the gate parser uses the
 *  same line as net income; here it lands in advisoryExtractions for the SPT cross-check). */
export function parseLabaBersih(text: string): number | null {
  return parseRupiahNear(text, /laba bersih|laba usaha bersih|laba setelah pajak/i)
}
/** Reported taxable income from an SPT Tahunan — 'Penghasilan Kena Pajak'/'Penghasilan Neto'. */
export function parsePendapatanSpt(text: string): number | null {
  return parseRupiahNear(text, /penghasilan kena pajak|penghasilan neto|penghasilan netto|jumlah penghasilan/i)
}
/** Average balance from a bank statement (rekening koran) — 'Saldo Rata-rata'/'Rata-rata Saldo'. */
export function parseSaldoRataRata(text: string): number | null {
  return parseRupiahNear(text, /saldo rata-?rata|rata-?rata saldo/i)
}
/** Outstanding principal (baki debet) from a SLIK report — beyond Kol. Advisory (NOT a gate). */
export function parseBakiDebet(text: string): number | null {
  return parseRupiahNear(text, /baki debet|baki debit|outstanding|plafon terpakai/i)
}
/** Count of active credit facilities from a SLIK report — advisory (beyond Kol). Matches an
 *  explicit "Fasilitas Aktif: N" / "N fasilitas aktif" count; null when not confidently found. */
export function parseFasilitasAktif(text: string): number | null {
  for (const line of text.split('\n')) {
    const m =
      line.match(/(\d{1,3})\s*fasilitas\s*(?:aktif|kredit)/i) ??
      line.match(/fasilitas\s*(?:aktif|kredit)[^0-9]{0,15}(\d{1,3})\b/i) ??
      line.match(/jumlah\s*fasilitas[^0-9]{0,15}(\d{1,3})\b/i)
    if (m) return Number(m[1])
  }
  return null
}

/** Market value (nilai pasar / nilai wajar) from an appraisal report. Advisory copy — the GATING
 *  appraised value stays financialInputs.collateralAppraisedValue (a distinct registry entry). */
export function parseNilaiPasar(text: string): number | null {
  return parseRupiahNear(text, /nilai pasar|nilai wajar/i)
}
/** Liquidation value (nilai likuidasi) from an appraisal report. Advisory only. */
export function parseNilaiLikuidasi(text: string): number | null {
  return parseRupiahNear(text, /nilai likuidasi|nilai jual cepat|nilai paksa/i)
}

// Find a Rupiah amount on a line that mentions `label`. Indonesian formatting uses '.' as the
// thousands separator (formatRupiah → "Rp 95.000.000"); we strip separators to the integer.
// Prefer an explicit "Rp" amount; else a grouped-thousands number (≥1 group) on the labelled
// line — never a bare 1–3 digit number (avoids matching counts/dates).
export function parseRupiahNear(text: string, label: RegExp): number | null {
  for (const line of text.split('\n')) {
    if (!label.test(line)) continue
    const m = line.match(/rp\.?\s*(\d[\d.,]*\d)/i) ?? line.match(/(\d{1,3}(?:[.,]\d{3})+)/)
    if (m) {
      const digits = m[1].replace(/\D/g, '')
      if (digits.length >= 4) return Number(digits)
    }
  }
  return null
}
