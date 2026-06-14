import { OctagonAlert } from 'lucide-react'
import { StatusChip } from '@/components/shared/StatusChip'
import type { HardGateViolation, HardGates } from '@/lib/types'
import { DEFAULT_RISK_POLICY, type RiskPolicy } from '@/lib/hardGates'

interface HardGateFlagsProps {
  hardGates: HardGates
  violations: HardGateViolation[]
  /** Active thresholds (recompute-live). Pass `app.riskPolicy`; falls back to the constant. */
  policy?: RiskPolicy
}

export function HardGateFlags({ hardGates, violations, policy = DEFAULT_RISK_POLICY }: HardGateFlagsProps) {
  if (violations.length === 0) return null

  const labels: Record<HardGateViolation, string> = {
    dsr: `DSR ${hardGates.dsr}% > ${policy.dsrMaxPct}%`,
    ltv: `LTV ${hardGates.ltv}% > ${policy.ltvMaxPct}%`,
    kol: `Kol ${hardGates.kol} > ${policy.kolMax}`,
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Hard gate terlewati">
      {violations.map((v) => (
        <StatusChip
          key={v}
          tone="danger"
          icon={OctagonAlert}
          label={labels[v]}
          className="border border-danger/20"
        />
      ))}
    </div>
  )
}
