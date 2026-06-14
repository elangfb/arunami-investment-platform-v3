// Advisory OCR cross-checks (RM-led OCR-widening — design §3). PURE, unit-tested, no I/O.
//
// THE INVARIANT (front-loaded): every function here produces an ADVISORY annotation only — a
// { against, status, note } recorded on an AdvisoryExtraction.crossCheck. NOTHING here ever
// blocks a stage advance, enters stage1To2Blockers/ocrBlockers/docBlockers, writes a hard gate,
// or flips a status. NIK stays the SOLE 1→2 blocker (the existing extractionMismatches.nik check
// in lib/stage-action.ts). These functions are "Mizan records, never monitors" made literal.
//
// PII: a cross-check NOTE about identity must NEVER embed a raw NIK/identity number (mirrors
// planMismatchResolution's PII care in lib/extraction-registry.ts). We say "berbeda" / name only,
// never the digits.

import type { AdvisoryExtraction, AppraisalRecord } from './types'

export type CrossCheckResult = { against: string; status: 'match' | 'mismatch'; note?: string }

/** Material-difference tolerance for amount cross-checks: |a-b| / max(a,b) > 30% ⇒ mismatch.
 *  Generous on purpose — advisory, only flags a MATERIAL gap (rounding/timing differences are
 *  expected between an SPT and a LapKeu), and never blocks anything. */
const MATERIAL_TOLERANCE = 0.3

function asAmount(v: AdvisoryExtraction | undefined): number | null {
  if (v == null) return null
  const n = typeof v.value === 'number' ? v.value : Number(v.value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function materiallyDifferent(a: number, b: number): boolean {
  const hi = Math.max(a, b)
  if (hi === 0) return false
  return Math.abs(a - b) / hi > MATERIAL_TOLERANCE
}

/**
 * SPT (reported taxable income) vs LapKeu (omzet / laba bersih). If BOTH the SPT figure and at
 * least one LapKeu figure are present, compares them; a materially-different reported income is an
 * advisory 'mismatch' (a signal Risk weighs, NOT a blocker). Returns null when there is nothing to
 * compare (one side missing) — no annotation. Prefers labaBersih over omzet as the comparable to
 * SPT taxable income (both are net-ish), falling back to omzet.
 */
export function crossCheckSptVsLapkeu(
  advisory: Record<string, AdvisoryExtraction> | undefined,
): CrossCheckResult | null {
  if (!advisory) return null
  const spt = asAmount(advisory.pendapatanSpt)
  if (spt == null) return null
  const laba = asAmount(advisory.labaBersih)
  const omzet = asAmount(advisory.omzet)
  const comparable = laba ?? omzet
  if (comparable == null) return null
  const comparableLabel = laba != null ? 'laba bersih (LapKeu)' : 'omzet (LapKeu)'
  if (materiallyDifferent(spt, comparable)) {
    return {
      against: 'spt_vs_lapkeu',
      status: 'mismatch',
      note: `Penghasilan dilaporkan SPT berbeda material dari ${comparableLabel} — perlu telaah (advisory, bukan blokir).`,
    }
  }
  return { against: 'spt_vs_lapkeu', status: 'match' }
}

/**
 * P3-D structured Penilaian (design §4): the Appraisal desk's STRUCTURED nilaiPasar/nilaiLikuidasi
 * (AppraisalRecord) vs the P2 OCR ADVISORY figures read from the appraisal_agunan doc
 * (advisory['nilaiPasar'] / advisory['nilaiLikuidasi']). ADVISORY ONLY — a material gap is a 'mismatch'
 * note Risk weighs, NEVER a blocker, NEVER an LTV input. Compares each pair that is present on BOTH
 * sides; returns null when there is nothing to compare (no structured figures, or no advisory figures).
 * Uses the same MATERIAL_TOLERANCE (30%) as the other amount cross-checks.
 */
export function crossCheckAppraisalVsAdvisory(
  record: Pick<AppraisalRecord, 'nilaiPasar' | 'nilaiLikuidasi'> | null | undefined,
  advisory: Record<string, AdvisoryExtraction> | undefined,
): CrossCheckResult | null {
  if (!record || !advisory) return null
  const pairs: { recVal: number | undefined; advVal: number | null; label: string }[] = [
    { recVal: record.nilaiPasar, advVal: asAmount(advisory.nilaiPasar), label: 'nilai pasar' },
    { recVal: record.nilaiLikuidasi, advVal: asAmount(advisory.nilaiLikuidasi), label: 'nilai likuidasi' },
  ]
  const comparable = pairs.filter(
    (p): p is { recVal: number; advVal: number; label: string } =>
      typeof p.recVal === 'number' && Number.isFinite(p.recVal) && p.recVal > 0 && p.advVal != null,
  )
  if (comparable.length === 0) return null
  const mismatched = comparable.filter((p) => materiallyDifferent(p.recVal, p.advVal))
  if (mismatched.length === 0) return { against: 'appraisal_vs_advisory', status: 'match' }
  return {
    against: 'appraisal_vs_advisory',
    status: 'mismatch',
    note: `Nilai penilaian (${mismatched.map((p) => p.label).join(', ')}) berbeda material dari hasil OCR laporan appraisal — perlu telaah (advisory, bukan blokir).`,
  }
}

/** A minimal name-bearing roster row (pengurus / pemegang saham). */
export interface RosterMember {
  nama: string
  [k: string]: unknown
}

/** The linked-Customer shape this cross-check reads (subset of server/repo/customer.ts Customer). */
export interface CustomerRosterView {
  pengurus?: RosterMember[] | null
  pemegangSaham?: RosterMember[] | null
}

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Akta/SK extracted roster (pengurus + pemegang saham names) vs the linked Customer aggregate.
 * Compares NAME sets (case/space-insensitive). Any name present in one but not the other yields an
 * advisory 'mismatch' note listing the diffs (names only — no NIK). Returns null when there is no
 * extracted roster to compare. Pengurus/pemegang saham names are not PII-sensitive the way a NIK
 * is, so naming them in the advisory note is acceptable (and useful for the RM's fix).
 */
export function crossCheckAktaVsCustomer(
  extractedPengurus: RosterMember[] | null | undefined,
  customer: CustomerRosterView | null | undefined,
): CrossCheckResult | null {
  const extracted = (extractedPengurus ?? []).map((m) => m?.nama).filter((n): n is string => !!n && n.trim() !== '')
  if (extracted.length === 0) return null
  const master = [
    ...((customer?.pengurus ?? []).map((m) => m?.nama)),
    ...((customer?.pemegangSaham ?? []).map((m) => m?.nama)),
  ].filter((n): n is string => !!n && n.trim() !== '')
  const masterSet = new Set(master.map(normName))
  const extractedSet = new Set(extracted.map(normName))
  const onlyInDoc = extracted.filter((n) => !masterSet.has(normName(n)))
  const onlyInMaster = master.filter((n) => !extractedSet.has(normName(n)))
  if (onlyInDoc.length === 0 && onlyInMaster.length === 0) {
    return { against: 'akta_vs_customer', status: 'match' }
  }
  const parts: string[] = []
  if (onlyInDoc.length) parts.push(`hanya di dokumen: ${onlyInDoc.join(', ')}`)
  if (onlyInMaster.length) parts.push(`hanya di data nasabah: ${onlyInMaster.join(', ')}`)
  return {
    against: 'akta_vs_customer',
    status: 'mismatch',
    note: `Pengurus/pemegang saham berbeda dari data nasabah (${parts.join('; ')}) — perlu telaah (advisory).`,
  }
}

/** Subset of the app's entered identity this cross-check reads. */
export interface IdentityView {
  nik?: string | null
  npwp?: string | null
}

/**
 * On a REPEAT app, compare the app's entered nik/npwp against the linked Customer's (the customer
 * master). A difference is an advisory note — NEVER a blocker (distinct from the existing
 * extractionMismatches.nik check, which stays the sole NIK blocker). PII: the note says WHICH field
 * differs, never the raw NIK/NPWP digits. Returns null when neither field is comparable on both
 * sides (nothing to check).
 */
export function crossCheckIdentityVsCustomerMaster(
  app: IdentityView,
  customer: IdentityView | null | undefined,
): CrossCheckResult | null {
  if (!customer) return null
  const diffs: string[] = []
  let compared = false
  if (app.nik && customer.nik) {
    compared = true
    if (app.nik.trim() !== customer.nik.trim()) diffs.push('NIK')
  }
  if (app.npwp && customer.npwp) {
    compared = true
    if (app.npwp.trim() !== customer.npwp.trim()) diffs.push('NPWP')
  }
  if (!compared) return null
  if (diffs.length === 0) return { against: 'identity_vs_customer_master', status: 'match' }
  return {
    against: 'identity_vs_customer_master',
    status: 'mismatch',
    // PII-safe: name the field(s), never the raw identity number.
    note: `${diffs.join(' & ')} berbeda dari data master nasabah — perlu telaah (advisory, bukan blokir).`,
  }
}
