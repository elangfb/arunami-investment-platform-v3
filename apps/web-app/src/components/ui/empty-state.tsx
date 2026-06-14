import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Canonical empty-state: icon (shape) + title + optional description + optional action. Use this
// instead of hand-rolled dashed boxes so every empty surface reads the same — never an unlabeled
// blank. The icon carries meaning alongside the text (WCAG 1.4.1).
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-10 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
