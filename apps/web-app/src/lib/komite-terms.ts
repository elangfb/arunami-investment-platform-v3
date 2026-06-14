import type { KomiteVoteValue, LoanApplication } from './types'

// Server-enforced validation of the committee's APPROVED terms. The chair sets these
// in the UI, but the values arrive over a POST-reachable server action, so the bounds
// are a server backstop — never trust the client. Kept pure (types-only import) so it
// is unit-testable and reusable. The akad's margin applicability is passed in (usesMargin)
// to avoid importing akad-config here (which would pull the @/ alias the test runner
// can't resolve).

export interface ApprovedTermsInput {
  approvedPlafond?: number
  approvedTenorMonths?: number
  approvedMarginRate?: number | null
}

/**
 * Validate the approved terms for an APPROVE decision. Returns an Indonesian error
 * message if invalid, or null if the terms are acceptable. Rules:
 *  - approvedPlafond: a positive number, and NOT greater than the requested plafond
 *    (the committee may approve the same or a lower amount, never more).
 *  - approvedTenorMonths: a positive integer.
 *  - approvedMarginRate: for flat akad (usesMargin) a number ≥ 0; for profit-share
 *    akad it must be absent/null (the margin does not apply).
 */
export function validateApprovedTerms(
  app: Pick<LoanApplication, 'requestedPlafond' | 'requestedTenorMonths'>,
  input: ApprovedTermsInput,
  usesMargin: boolean,
): string | null {
  const { approvedPlafond, approvedTenorMonths, approvedMarginRate } = input

  if (approvedPlafond == null || !Number.isFinite(approvedPlafond) || approvedPlafond <= 0) {
    return 'Plafond disetujui harus berupa angka lebih dari 0.'
  }
  if (approvedPlafond > app.requestedPlafond) {
    return `Plafond disetujui (Rp ${approvedPlafond.toLocaleString('id-ID')}) tidak boleh melebihi plafond yang diajukan (Rp ${app.requestedPlafond.toLocaleString('id-ID')}).`
  }
  if (approvedTenorMonths == null || !Number.isInteger(approvedTenorMonths) || approvedTenorMonths <= 0) {
    return 'Tenor disetujui harus berupa bilangan bulat lebih dari 0 bulan.'
  }
  if (usesMargin) {
    if (approvedMarginRate == null || !Number.isFinite(approvedMarginRate) || approvedMarginRate < 0) {
      return 'Margin disetujui harus berupa angka 0 atau lebih untuk akad ini.'
    }
  } else if (approvedMarginRate != null) {
    return 'Akad bagi hasil tidak menggunakan margin — margin disetujui harus kosong.'
  }
  return null
}

/**
 * A Conditional or Reject committee decision MUST carry a note — the recorded rationale is the
 * OJK audit basis for a non-approval. Approve may omit it (the approved terms carry the why).
 * Returns an Indonesian error message if the note is required but blank, else null. Pure so the
 * POST-reachable server action (submitDecisionAction) and the UI can share one rule.
 */
export function validateDecisionNote(decision: KomiteVoteValue, note: string): string | null {
  if (decision !== 'approve' && !note.trim()) {
    return 'Catatan keputusan wajib diisi untuk keputusan Conditional atau Reject.'
  }
  return null
}
