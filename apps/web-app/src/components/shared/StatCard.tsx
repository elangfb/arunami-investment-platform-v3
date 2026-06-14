import type { ComponentType } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Shared KPI / stat card: label + big tabular value + sub-line + accented icon
// chip. The canonical KPI card — portofolio is the first adopter; the dashboard
// `KpiCard` should converge onto this (see upgrade-backlog).
export type StatCardTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const ICON_TONE: Record<StatCardTone, string> = {
  primary: 'bg-accent text-primary',
  success: 'bg-success-subtle text-success-foreground',
  warning: 'bg-warning-subtle text-warning-foreground',
  danger: 'bg-danger-subtle text-danger-foreground',
  info: 'bg-info-subtle text-info-foreground',
  neutral: 'bg-neutral-token-subtle text-neutral-token-foreground',
}

interface StatCardProps {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  sub: string
  tone?: StatCardTone
  /** Tint the value text in the tone (use for the headline danger/NPL metric). */
  emphasizeValue?: boolean
  className?: string
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'primary', emphasizeValue = false, className }: StatCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p
            className={cn(
              'font-heading text-3xl font-semibold leading-none tracking-tight tabular',
              emphasizeValue && tone === 'danger' ? 'text-danger' : 'text-foreground',
            )}
          >
            {value}
          </p>
          <p className="pt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', ICON_TONE[tone])}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  )
}
