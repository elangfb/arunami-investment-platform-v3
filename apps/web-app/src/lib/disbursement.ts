import { DEFAULT_DISBURSEMENT_CONDITIONS } from '@/lib/config/disbursement-conditions'
import type { DisbursementStatus } from '@/lib/types'

// Disbursement step order + release conditions. Extracted from PencairanTab so the
// SERVER enforces the gating (you cannot reach "Cair" until every condition is met,
// and you can only advance one step at a time). The client imports the same order
// for its stepper UI.

export const DISBURSEMENT_STEPS: DisbursementStatus[] = ['Verifikasi Final', 'Proses Akad', 'Siap Cair', 'Cair']

export const DISBURSEMENT_CONDITIONS = DEFAULT_DISBURSEMENT_CONDITIONS

/** The status that legally follows `current`, or null if already at the terminal step. */
export function nextDisbursementStatus(current: DisbursementStatus): DisbursementStatus | null {
  const i = DISBURSEMENT_STEPS.indexOf(current)
  if (i < 0 || i >= DISBURSEMENT_STEPS.length - 1) return null
  return DISBURSEMENT_STEPS[i + 1]
}

/** Are all release conditions satisfied? (Required before advancing to "Cair".) */
export function disbursementConditionsComplete(
  done: Record<string, boolean> | undefined,
  conditions: string[] = DEFAULT_DISBURSEMENT_CONDITIONS,
): boolean {
  return conditions.every((c) => done?.[c])
}
