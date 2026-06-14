import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

// The single status-chip primitive, built on the semantic status tokens
// (success/warning/danger/info/neutral) whose meanings never change. Use this
// for any small status pill — kolektibilitas, notification severity, counts —
// instead of hand-rolling ad-hoc emerald/amber/red classes. `SLAChip` now renders through it;
// `AkadBadge` keeps intentional akad hues (see upgrade-backlog).
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

// neutral resolves to the `--neutral-token*` family (Tailwind utility prefix
// `neutral-token`), the rest map straight to their token name.
const TONE: Record<StatusTone, { chip: string; dot: string }> = {
  success: { chip: 'bg-success-subtle text-success-foreground ring-success/15', dot: 'bg-success' },
  warning: { chip: 'bg-warning-subtle text-warning-foreground ring-warning/15', dot: 'bg-warning' },
  danger: { chip: 'bg-danger-subtle text-danger-foreground ring-danger/15', dot: 'bg-danger' },
  info: { chip: 'bg-info-subtle text-info-foreground ring-info/15', dot: 'bg-info' },
  neutral: { chip: 'bg-neutral-token-subtle text-neutral-token-foreground ring-neutral-token/15', dot: 'bg-neutral-token' },
}

const SIZE = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
} as const

interface StatusChipProps {
  tone: StatusTone
  label: string
  /** Leading status dot (default true). Mutually exclusive with `icon`. */
  dot?: boolean
  /** Pulse the dot (e.g. overdue) — only applies when `dot` is shown. */
  pulse?: boolean
  /** Leading icon instead of the dot. */
  icon?: ComponentType<{ className?: string }>
  size?: keyof typeof SIZE
  className?: string
}

export function StatusChip({ tone, label, dot = true, pulse = false, icon: Icon, size = 'sm', className }: StatusChipProps) {
  const { chip, dot: dotClass } = TONE[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset',
        SIZE[size],
        chip,
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-3.5" />
      ) : dot ? (
        <span className={cn('h-1.5 w-1.5 rounded-full', dotClass, pulse && 'animate-pulse')} />
      ) : null}
      {label}
    </span>
  )
}
