'use client'

import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A grouped block of form fields — icon-chip header + responsive 2-column grid.
 * Visually a card (same tokens as <Card>) but with a richer section header.
 * Mirrors the section idiom already used in MeetingScheduler.
 */
export function FormSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ComponentType<{ className?: string }>
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]">
      <div className="mb-4 flex items-start gap-3">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-primary/10">
            <Icon className="size-4.5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold leading-snug text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className={cn('grid gap-x-5 gap-y-4 sm:grid-cols-2', className)}>{children}</div>
    </section>
  )
}

/**
 * A label + control pair. `full` spans both grid columns; `hint` renders helper
 * text below the control.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  full,
  className,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  full?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', full && 'sm:col-span-2', className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/**
 * iOS-style segmented control for small mutually-exclusive choices — a friendlier,
 * faster alternative to a <Select> for 2–3 options. The active "thumb" slides via
 * a background + shadow transition.
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode; icon?: ComponentType<{ className?: string }> }[]
  className?: string
}) {
  return (
    <div role="radiogroup" className={cn('flex rounded-lg border border-border bg-muted/60 p-0.5', className)}>
      {options.map((opt) => {
        const on = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-1.5 text-sm font-medium transition-all duration-200',
              on
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
