import type { AkadType } from '@/lib/types'
import { isFlatAkad } from '@/lib/akad-config'

// Single source of truth for the hard-gate financial computation (DSR / LTV).
// Extracted from DataTab so the SERVER computes these authoritatively on save —
// DSR > 40% and LTV > 70% are OJK hard-gate failures, so the numbers that drive
// them must never be trusted from the client. The client imports the same fn for
// the live preview, guaranteeing the preview and the persisted value never drift.

export interface HardGateComputeInput {
  requestedPlafond: number
  requestedTenorMonths: number
  akadType: AkadType
  netMonthlyIncome: number
  existingMonthlyObligations: number
  collateralAppraisedValue: number
  /** Profit-share akad only — the projected monthly profit share (DSR numerator). */
  projectedMonthlyProfitShare?: number | null
  /** Flat akad only — the annual margin/ujrah rate (%). */
  marginRate?: number | null
}

/** Total flat-akad return over the tenor (plafond × rate/yr × years). */
export function computeTotalMargin(plafond: number, tenorMonths: number, marginRate: number): number {
  return plafond * (marginRate / 100) * (tenorMonths / 12)
}

/** The flat-akad monthly installment ((plafond + total margin) / tenor). */
export function computeInstallment(plafond: number, tenorMonths: number, marginRate: number): number {
  if (tenorMonths <= 0) return 0
  return Math.round((plafond + computeTotalMargin(plafond, tenorMonths, marginRate)) / tenorMonths)
}

/**
 * The hard-gate ratios. Flat akad uses the computed installment as the DSR numerator;
 * profit-share akad uses the projected monthly profit share. Mirrors DataTab's prior
 * client formula exactly.
 */
export function computeHardGates(input: HardGateComputeInput): { dsr: number; ltv: number; installment: number } {
  const flat = isFlatAkad(input.akadType)
  const installment = flat ? computeInstallment(input.requestedPlafond, input.requestedTenorMonths, input.marginRate ?? 0) : 0
  const effectivePayment = flat ? installment : (input.projectedMonthlyProfitShare ?? 0)
  const dsr = input.netMonthlyIncome > 0
    ? Math.round(((input.existingMonthlyObligations + effectivePayment) / input.netMonthlyIncome) * 100)
    : 0
  const ltv = input.collateralAppraisedValue > 0
    ? Math.round((input.requestedPlafond / input.collateralAppraisedValue) * 100)
    : 0
  return { dsr, ltv, installment }
}
