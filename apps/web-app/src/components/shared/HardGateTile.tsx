import { CheckCircle2, Circle, OctagonAlert } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/shared/StatusChip'
import { cn } from '@/lib/utils'

/**
 * Shared hard-gate (DSR/LTV/Kol) indicator tile — the single read-only component for every
 * hard-gate display (Ringkasan, Data, Komite). Replaces the per-surface forks (`Gate`,
 * `GateChip`, `Stat`). The editable Kol entry stays separate (DataTab `KolEntryRow`).
 *
 * States: unassessed → dashed + neutral "Belum dinilai"; pass → success check + "Lolos";
 * breach → danger octagon + "Terlewati". Every assessed state carries a pass/fail signal that
 * pairs the semantic token with a text label AND a shape-distinct icon (check vs octagon, per
 * the octagon=danger·triangle=warning·circle=info convention) so it never relies on colour
 * alone (WCAG 1.4.1). The threshold (`maks …`) renders inline beside the value when provided.
 */
const SIGNAL: Record<'unassessed' | 'pass' | 'breach', { tone: StatusTone; icon: typeof Circle; label: string }> = {
  unassessed: { tone: 'neutral', icon: Circle, label: 'Belum dinilai' },
  pass: { tone: 'success', icon: CheckCircle2, label: 'Lolos' },
  breach: { tone: 'danger', icon: OctagonAlert, label: 'Terlewati' },
}

export function HardGateTile({
  label,
  value,
  assessed = true,
  violated = false,
  threshold,
}: {
  label: string
  value: string
  assessed?: boolean
  violated?: boolean
  /** Formatted threshold shown inline beside the value, e.g. "maks 40%". Omitted gracefully. */
  threshold?: string
}) {
  const state = !assessed ? 'unassessed' : violated ? 'breach' : 'pass'
  const signal = SIGNAL[state]
  const breach = state === 'breach'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        state === 'unassessed' && 'border-dashed',
        state === 'pass' && 'border-success/40 bg-success-subtle',
        breach && 'border-danger bg-danger-subtle',
      )}
    >
      <p className={cn('text-sm font-medium', breach ? 'text-danger-foreground' : 'text-foreground')}>{label}</p>
      {assessed ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cn('text-xl font-semibold tabular-nums', breach && 'text-danger-foreground')}>{value}</span>
          {threshold && (
            <span className={cn('text-xs tabular-nums', breach ? 'text-danger-foreground/80' : 'text-muted-foreground')}>
              · {threshold}
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Belum dinilai</p>
      )}
      <StatusChip tone={signal.tone} icon={signal.icon} label={signal.label} className="self-start" />
    </div>
  )
}
