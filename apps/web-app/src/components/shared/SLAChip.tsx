'use client'
import { getSLAStatus, getSLALabel, slaState } from '@/lib/sla-utils'
import { StatusChip, type StatusTone } from '@/components/shared/StatusChip'
import type { LoanApplication, SLAStatus, Stage } from '@/lib/types'

// SLA pill — now rendered through the canonical StatusChip + semantic tokens (no more hand-rolled
// emerald/amber/red). The SLA status maps onto the shared tone vocabulary so every SLA indicator in
// the app reads the same as kolektibilitas, severity, and score chips.
const SLA_TONE: Record<SLAStatus, StatusTone> = {
  normal: 'success',
  at_risk: 'warning',
  overdue: 'danger',
  done: 'neutral',
}

interface SLAChipProps {
  stage: Stage
  enteredStageAt: Date
  // When provided, the chip is terminal-aware (Cair → "Selesai", reject →
  // "Ditolak", no alarm). Without it, falls back to the live stage clock.
  app?: LoanApplication
}

export function SLAChip({ stage, enteredStageAt, app }: SLAChipProps) {
  const { status, label } = app
    ? slaState(app)
    : { status: getSLAStatus(stage, enteredStageAt), label: getSLALabel(stage, enteredStageAt) }

  return <StatusChip tone={SLA_TONE[status]} label={label} pulse={status === 'overdue'} />
}
