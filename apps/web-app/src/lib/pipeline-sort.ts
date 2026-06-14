import type { LoanApplication, SLAStatus } from '@/lib/types'
import { getSLAStatus } from '@/lib/sla-utils'

// SLA severity ranking — drives the pipeline "worst SLA" rollup and the default row sort.
export const SLA_RANK: Record<SLAStatus, number> = {
  done: -1, // terminal/finished — never the "worst" status
  normal: 0,
  at_risk: 1,
  overdue: 2,
}

// Live SLA status for an application's current stage (config-resolved target via slaTargetDays).
export function applicationSLAStatus(app: LoanApplication): SLAStatus {
  return getSLAStatus(app.stage, app.enteredStageAt, app.slaTargetDays)
}

// Default pipeline row order WITHIN a stage: most urgent first (worst SLA), ties broken by the
// oldest submission (FIFO). Both keys are surfaced in the row (SLA chip + the "Diajukan" column)
// so the order is self-explanatory — unlike the old plafond tiebreaker, which ranked by loan size
// for no operational reason.
export function comparePipelineRows(a: LoanApplication, b: LoanApplication): number {
  const bySLA = SLA_RANK[applicationSLAStatus(b)] - SLA_RANK[applicationSLAStatus(a)]
  if (bySLA !== 0) return bySLA
  return a.createdAt.getTime() - b.createdAt.getTime()
}
