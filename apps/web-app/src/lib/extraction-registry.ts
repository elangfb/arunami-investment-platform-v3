// Declarative field-extraction registry — the single source of truth for "which application
// field can be read from which document, who confirms it, and how to validate it." Replaces the
// hard-coded if/else in server/actions/application-data.ts (applyGateSuggestion): adding a new
// extracted field is now ONE entry here, not edits across the upload actions.
//
// Two safety rules baked in (workflow-finetune.md §15.2 — high-stakes core):
//   1. GATING fields (DSR/LTV/Kol inputs: Kol, net income, appraised value) NEVER auto-confirm,
//      even at high model confidence → deriveConfidence() forces 'review'. The human owner
//      confirms; the gate is recomputed server-side. A misread can never silently become credit.
//   2. Don't trust a model's self-reported confidence — VALIDATE the value (NIK = 16 digits,
//      Kol ∈ 1..5, amounts > 0). An invalid parse is dropped (field stays manual), never written.
//
// ExtractedField<T> is the engine-agnostic return shape the 2c Document AI structured extractor
// (docs/guides/document-ai-ocr.md) drops into — text-regex today, typed {value,confidence} later,
// same registry. parseFromText delegates to lib/ocr.ts so the existing conservative parsers +
// their tests are unchanged.

import type { Desk } from './desks'
import type { ExtractionSource } from './types'
import {
  parseGateValueFromText, parseNpwp, parseNib, parseAddress, parseSektor,
  parseOmzet, parseLabaBersih, parsePendapatanSpt, parseSaldoRataRata, parseBakiDebet, parseFasilitasAktif, parseNilaiPasar, parseNilaiLikuidasi,
} from './ocr'

/** identity = a string identifier (NIK); gating = a number feeding a hard gate (Kol/DSR/LTV);
 *  advisory = an INFORMATIONAL field read from a doc that NEVER gates anything (RM-led OCR-widening,
 *  design §3). An advisory field's fieldPath is a KEY into LoanApplication.advisoryExtractions, NOT a
 *  LoanApplication path — it never writes to hardGates/financialInputs/any gate input, never enters a
 *  blocker set, never blesses/confirms. Cross-check only. "Mizan records, never monitors." */
export type FieldKind = 'identity' | 'gating' | 'advisory'

/** A field that OCR/extraction can suggest, plus how to source, own, and validate it. */
export interface FieldExtractor {
  /** Dotted path on LoanApplication (≤1 level of nesting). */
  fieldPath: string
  label: string
  /** docTypes whose OCR text can yield this field. */
  sourceDocTypes: string[]
  /** The desk whose holder confirms this field's suggestion. */
  ownerDesk: Desk
  kind: FieldKind
  /** Parse a value from a document's OCR'd full text; null = not confidently found (stay manual).
   *  Gating fields return a number; identity fields (NPWP/NIB/alamat) return a string. */
  parseFromText?: (text: string, docType: string) => string | number | null
  /** Validate a candidate value (checksum/format). Absent = always valid. */
  validate?: (value: unknown) => { ok: boolean; reason?: string }
}

// ── Validators (don't trust reported confidence — check the value) ─────────────────
export function validateNik(value: unknown): { ok: boolean; reason?: string } {
  return /^\d{16}$/.test(String(value)) ? { ok: true } : { ok: false, reason: 'NIK harus 16 digit' }
}
export function validateKol(value: unknown): { ok: boolean; reason?: string } {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? { ok: true } : { ok: false, reason: 'Kol harus 1–5' }
}
export function validatePositiveAmount(value: unknown): { ok: boolean; reason?: string } {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? { ok: true } : { ok: false, reason: 'Nilai harus lebih dari 0' }
}
// Identity validators (Batch 9) — format checks on the digit content, never trusting the parse.
export function validateNpwp(value: unknown): { ok: boolean; reason?: string } {
  const digits = String(value).replace(/\D/g, '')
  return digits.length === 15 || digits.length === 16 ? { ok: true } : { ok: false, reason: 'NPWP harus 15 atau 16 digit' }
}
export function validateNib(value: unknown): { ok: boolean; reason?: string } {
  const digits = String(value).replace(/\D/g, '')
  return digits.length === 13 ? { ok: true } : { ok: false, reason: 'NIB harus 13 digit' }
}
export function validateAlamat(value: unknown): { ok: boolean; reason?: string } {
  return String(value).trim().length >= 8 ? { ok: true } : { ok: false, reason: 'Alamat terlalu pendek' }
}
export function validateBidangUsaha(value: unknown): { ok: boolean; reason?: string } {
  return String(value).trim().length >= 3 ? { ok: true } : { ok: false, reason: 'Bidang usaha terlalu pendek' }
}

export const FIELD_REGISTRY: FieldExtractor[] = [
  { fieldPath: 'nik', label: 'NIK', sourceDocTypes: ['ktp'], ownerDesk: 'intake', kind: 'identity', validate: validateNik },
  {
    fieldPath: 'hardGates.kol',
    label: 'Kolektibilitas',
    sourceDocTypes: ['slik_report'],
    ownerDesk: 'slik',
    kind: 'gating',
    parseFromText: (text) => parseGateValueFromText('slik_report', text),
    validate: validateKol,
  },
  {
    fieldPath: 'financialInputs.netMonthlyIncome',
    label: 'Penghasilan Bersih per Bulan',
    sourceDocTypes: ['slip_gaji', 'laporan_keuangan'],
    ownerDesk: 'muap-author',
    kind: 'gating',
    parseFromText: (text, docType) => parseGateValueFromText(docType, text),
    validate: validatePositiveAmount,
  },
  {
    fieldPath: 'financialInputs.collateralAppraisedValue',
    label: 'Nilai Appraisal Agunan',
    sourceDocTypes: ['appraisal_agunan'],
    ownerDesk: 'muap-author',
    kind: 'gating',
    parseFromText: (text) => parseGateValueFromText('appraisal_agunan', text),
    validate: validatePositiveAmount,
  },
  // ── Legal-identity fields (Batch 9) — intake-owned, string-valued, fill MUAP IDENTITAS HUKUM ──
  { fieldPath: 'npwp', label: 'NPWP', sourceDocTypes: ['npwp'], ownerDesk: 'intake', kind: 'identity', parseFromText: (text) => parseNpwp(text), validate: validateNpwp },
  { fieldPath: 'nib', label: 'NIB', sourceDocTypes: ['nib'], ownerDesk: 'intake', kind: 'identity', parseFromText: (text) => parseNib(text), validate: validateNib },
  { fieldPath: 'alamat', label: 'Alamat Legalitas', sourceDocTypes: ['nib'], ownerDesk: 'intake', kind: 'identity', parseFromText: (text) => parseAddress(text), validate: validateAlamat },
  { fieldPath: 'bidangUsaha', label: 'Bidang Usaha', sourceDocTypes: ['nib', 'siup'], ownerDesk: 'intake', kind: 'identity', parseFromText: (text) => parseSektor(text), validate: validateBidangUsaha },

  // ── Advisory fields (RM-led OCR-widening — design §3) ────────────────────────────────────────
  // ADVISORY ONLY: each fieldPath here is a KEY into LoanApplication.advisoryExtractions, NOT a
  // LoanApplication path. These NEVER gate, NEVER enter a blocker set, NEVER feed hardGates/
  // financialInputs. They are informational + cross-check ("Mizan records, never monitors"). NIK
  // stays the sole 1→2 blocker. Surfaced read-only in the Data tab; the SPT-vs-LapKeu and
  // identity-vs-customer-master cross-checks annotate (never block). Parsers are HEURISTIC — tuned
  // on sample TEXT, not real provider output; need real-OCR samples to tune (the stub fabricates).
  { fieldPath: 'omzet', label: 'Omzet / Penjualan', sourceDocTypes: ['laporan_keuangan'], ownerDesk: 'muap-author', kind: 'advisory', parseFromText: (text) => parseOmzet(text), validate: validatePositiveAmount },
  { fieldPath: 'labaBersih', label: 'Laba Bersih', sourceDocTypes: ['laporan_keuangan'], ownerDesk: 'muap-author', kind: 'advisory', parseFromText: (text) => parseLabaBersih(text), validate: validatePositiveAmount },
  { fieldPath: 'pendapatanSpt', label: 'Penghasilan Kena Pajak (SPT)', sourceDocTypes: ['spt_tahunan'], ownerDesk: 'intake', kind: 'advisory', parseFromText: (text) => parsePendapatanSpt(text), validate: validatePositiveAmount },
  { fieldPath: 'saldoRataRata', label: 'Saldo Rata-rata', sourceDocTypes: ['rekening_koran_perusahaan', 'rekening_koran_pribadi'], ownerDesk: 'muap-author', kind: 'advisory', parseFromText: (text) => parseSaldoRataRata(text), validate: validatePositiveAmount },
  { fieldPath: 'bakiDebet', label: 'Baki Debet', sourceDocTypes: ['slik_report'], ownerDesk: 'slik', kind: 'advisory', parseFromText: (text) => parseBakiDebet(text), validate: validatePositiveAmount },
  { fieldPath: 'fasilitasAktif', label: 'Fasilitas Aktif', sourceDocTypes: ['slik_report'], ownerDesk: 'slik', kind: 'advisory', parseFromText: (text) => parseFasilitasAktif(text), validate: validatePositiveAmount },
  { fieldPath: 'nilaiPasar', label: 'Nilai Pasar Agunan', sourceDocTypes: ['appraisal_agunan'], ownerDesk: 'muap-author', kind: 'advisory', parseFromText: (text) => parseNilaiPasar(text), validate: validatePositiveAmount },
  { fieldPath: 'nilaiLikuidasi', label: 'Nilai Likuidasi Agunan', sourceDocTypes: ['appraisal_agunan'], ownerDesk: 'muap-author', kind: 'advisory', parseFromText: (text) => parseNilaiLikuidasi(text), validate: validatePositiveAmount },
]

/** Field labels keyed by fieldPath — for the new Data-tab "needs confirmation" surfaces.
 *  (The existing Stage blocker list keeps its own richer OCR_FIELD_LABELS for now.) */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  FIELD_REGISTRY.map((f) => [f.fieldPath, f.label]),
)

const REGISTRY_BY_PATH = new Map(FIELD_REGISTRY.map((f) => [f.fieldPath, f]))

/** The registry entry for a fieldPath (label, ownerDesk, validator, kind), or undefined.
 *  Drives BOTH the generic confirm action (server-authoritative ownerDesk gate) and the
 *  desk-scoped advance gates (only count a desk's own unconfirmed suggestions). Pure → safe
 *  to import client-side. */
export function getFieldExtractor(fieldPath: string): FieldExtractor | undefined {
  return REGISTRY_BY_PATH.get(fieldPath)
}

/**
 * All field suggestions a document's OCR text yields, driven by the registry: parse → validate →
 * keep. Covers BOTH gating numbers (Kol/income/appraisal) and identity strings (NPWP/NIB/alamat).
 * Conservative: a field absent from the text, or one that fails validation, is omitted (stays
 * manual) rather than written with a bad value. Caller marks each ocr_suggested.
 */
export function ocrSuggestionsFor(docType: string, text: string): { fieldPath: string; value: string | number }[] {
  const out: { fieldPath: string; value: string | number }[] = []
  for (const f of FIELD_REGISTRY) {
    if (f.kind === 'advisory') continue // advisory fields go through advisorySuggestionsFor — NEVER gate
    if (!f.parseFromText || !f.sourceDocTypes.includes(docType)) continue
    const value = f.parseFromText(text, docType)
    if (value == null) continue
    if (f.validate && !f.validate(value).ok) continue
    out.push({ fieldPath: f.fieldPath, value })
  }
  return out
}

/**
 * Advisory extractions a document's OCR text yields (RM-led OCR-widening — design §3). A STRICTLY
 * SEPARATE path from ocrSuggestionsFor: it only ever returns `kind:'advisory'` fields, whose
 * fieldPath is a KEY into LoanApplication.advisoryExtractions (NOT a LoanApplication path). The
 * caller writes these into advisoryExtractions[key] — they NEVER reconcile against a gating field,
 * NEVER touch hardGates/financialInputs, NEVER enter a blocker set. Same conservative parse→validate
 * posture (absent/invalid → omitted). `label` is carried so the writer can stamp it without a re-lookup.
 */
export function advisorySuggestionsFor(docType: string, text: string): { key: string; value: string | number; label: string }[] {
  const out: { key: string; value: string | number; label: string }[] = []
  for (const f of FIELD_REGISTRY) {
    if (f.kind !== 'advisory') continue
    if (!f.parseFromText || !f.sourceDocTypes.includes(docType)) continue
    const value = f.parseFromText(text, docType)
    if (value == null) continue
    if (f.validate && !f.validate(value).ok) continue
    out.push({ key: f.fieldPath, value, label: f.label })
  }
  return out
}

/** The set of advisory KEYS (fieldPath of every kind:'advisory' entry). Used by guard tests to
 *  assert no advisory key is a gating LoanApplication path or appears in any blocker set. */
export const ADVISORY_KEYS: ReadonlySet<string> = new Set(
  FIELD_REGISTRY.filter((f) => f.kind === 'advisory').map((f) => f.fieldPath),
)

// ── Cross-check reconciliation (Batch 6) ────────────────────────────────────────────
// When OCR yields a value for a field, decide what to do with it relative to what Mizan already
// holds. The invariant: OCR NEVER auto-overwrites a value a human already blessed.
//   - 'fill'     — the field is empty / still a raw suggestion (unblessed) → write the suggestion.
//   - 'match'    — the field is blessed and OCR agrees → no change (re-read confirms it).
//   - 'mismatch' — the field is blessed and OCR DIFFERS → record the conflict, keep the Mizan value,
//                  let the owner resolve (keep / accept).
export type ExtractionReconcile = 'fill' | 'match' | 'mismatch'

/** A field is "blessed" once a human stands behind its value — entered it, confirmed the OCR
 *  suggestion, or overrode it. A bare 'ocr_suggested' (or absent) provenance is NOT blessed. */
export function isBlessedProvenance(p: ExtractionSource | undefined): boolean {
  return p === 'human_entered' || p === 'ocr_confirmed' || p === 'ocr_overridden'
}

/** Equality for cross-check. Identity values (NIK 16 digits, NPWP 15/16) compare as trimmed
 *  STRINGS — never via Number(), because a 16-digit NIK exceeds 2^53 (9,007,199,254,740,992) so
 *  two distinct high-province NIKs (e.g. 9171000000000000 vs …001) round to the SAME double and
 *  would falsely compare equal, silently bypassing the NIK 1→2 identity gate. Gating fields are
 *  numbers (compare numerically, tolerating string vs number). null/undefined/empty on either
 *  side ≠ equal. */
export function extractionValuesEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null || a === '' || b === '') return false
  // Identity: if EITHER side is an all-digit string of length ≥15 (NIK/NPWP), the value is an
  // identifier, not a magnitude — compare as trimmed strings to avoid float-precision collisions.
  const isLongDigitId = (v: unknown) => typeof v === 'string' && /^\d{15,}$/.test(v.trim())
  if (isLongDigitId(a) || isLongDigitId(b)) return String(a).trim() === String(b).trim()
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return String(a).trim() === String(b).trim()
}

/** Pure cross-check decision (Batch 6 / T1). Unblessed → fill (legacy behavior); blessed + equal →
 *  match (no-op); blessed + different → mismatch (record, don't overwrite). */
export function reconcileExtraction(
  existingValue: unknown,
  provenance: ExtractionSource | undefined,
  ocrValue: unknown,
): ExtractionReconcile {
  if (!isBlessedProvenance(provenance)) return 'fill'
  return extractionValuesEqual(existingValue, ocrValue) ? 'match' : 'mismatch'
}

/** A mismatch resolution plan (Batch 6 / T2) — pure so it's unit-tested without DB/session.
 *  `accept` writes the OCR value back as a fresh suggestion (gating re-enters confirm+recompute —
 *  never blind credit); `keep` writes nothing. The audit string NEVER includes a raw IDENTITY value
 *  (NIK is PII) — only gating numeric deltas are recorded. Throws if accepting an invalid OCR value. */
export interface MismatchResolutionPlan {
  /** Value to write to the field (then mark ocr_suggested), or null to leave the Mizan value. */
  acceptValue: string | number | null
  /** Audit line — PII-safe (no identity values). */
  audit: string
}
export function planMismatchResolution(
  entry: Pick<FieldExtractor, 'kind' | 'label' | 'validate'>,
  mismatch: { existingValue: string; ocrValue: string },
  resolution: 'keep' | 'accept',
): MismatchResolutionPlan {
  const isIdentity = entry.kind === 'identity'
  if (resolution === 'accept') {
    const check = entry.validate?.(mismatch.ocrValue)
    if (check && !check.ok) throw new Error(check.reason ?? 'Nilai OCR tidak valid')
    const delta = isIdentity ? '' : ` (${mismatch.existingValue} → ${mismatch.ocrValue})`
    return {
      acceptValue: isIdentity ? mismatch.ocrValue : Number(mismatch.ocrValue),
      audit: `Selisih OCR ${entry.label} — nilai dokumen (OCR) diambil${delta}; perlu konfirmasi ulang`,
    }
  }
  const seen = isIdentity ? '' : ` (OCR: ${mismatch.ocrValue})`
  return { acceptValue: null, audit: `Selisih OCR ${entry.label} — nilai Mizan dipertahankan${seen}` }
}

// ── ExtractedField<T> — the 2c structured-extraction return shape ───────────────────
export interface ExtractedField<T> {
  value: T | null
  /** Provider-reported confidence (0..1), or null when none (regex/stub). NOT trusted alone. */
  rawConfidence: number | null
  /** DERIVED tier used by the UI: high = auto-fill OK, review = prefill + force confirm, low = blank. */
  confidence: 'high' | 'review' | 'low'
  validation?: { ok: boolean; reason?: string }
}

/**
 * Derive the UI confidence tier (§15.2). GATING fields are ALWAYS 'review' — they must be
 * human-confirmed regardless of how sure the model claims to be. Non-gating: ≥0.9 high,
 * ≥0.6 review, else low; unknown confidence is treated as 'review' (prefill + confirm).
 */
export function deriveConfidence(rawConfidence: number | null, kind: FieldKind): 'high' | 'review' | 'low' {
  if (kind === 'gating') return 'review'
  if (rawConfidence == null) return 'review'
  if (rawConfidence >= 0.9) return 'high'
  if (rawConfidence >= 0.6) return 'review'
  return 'low'
}
