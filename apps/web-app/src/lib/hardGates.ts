import type { HardGates, HardGateViolation } from '@/lib/types'

// OJK hard gates: a ratio/value STRICTLY GREATER than its max FAILS (boundary == passes).
// Phase C (configurability-and-admin.md) makes the thresholds versioned config; this const is
// the single source + the seed/fallback for RiskPolicyVersion. `computeViolations` takes the
// policy as a param (default = this const) so the cutover is behavior-preserving until a caller
// passes a resolved/frozen policy — keeping the compliance computation a pure function.
export interface RiskPolicy {
  dsrMaxPct: number
  ltvMaxPct: number
  kolMax: number
}

export const DEFAULT_RISK_POLICY: RiskPolicy = { dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 1 }

export function computeViolations(
  hardGates: HardGates,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
): HardGateViolation[] {
  const violations: HardGateViolation[] = []
  if (hardGates.dsr > policy.dsrMaxPct) violations.push('dsr')
  if (hardGates.ltv > policy.ltvMaxPct) violations.push('ltv')
  if (hardGates.kol > policy.kolMax) violations.push('kol')
  return violations
}
