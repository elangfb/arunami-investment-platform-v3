// Compound page shell (Base UI style): `<Page.Root>` / `<Page.Header>` / `<Page.ActionBar>`.
//
//   import { Page } from '@/components/layout/Page'
//   <Page.Root>
//     <Page.Header eyebrow="…" title="…" description="…">{actions}</Page.Header>
//     …content…
//     <Page.ActionBar>{buttons}</Page.ActionBar>
//   </Page.Root>
//
// NOTE: this module deliberately has NO `'use client'` directive. The parts are
// presentational (no hooks/state) and AppLayout is the client boundary, so the
// `Page` object stays a real value across imports — that's what lets the dotted
// parts render inside Server Components (portofolio, notifications). Adding
// `'use client'` here would turn `Page` into a client-reference whose `.Root`
// reads as undefined in a Server Component (a render crash).

import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The standardized page content container. The app shell (sidebar + scroll <main>)
 * is provided once by the (app) route-group layout, so Root is just the inner
 * wrapper. `className` tunes width — list/table pages stay full-bleed (default);
 * forms/reading surfaces pass e.g. `mx-auto max-w-4xl`.
 */
function Root({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6', className)}>{children}</div>
}

type HeaderProps = {
  /** Small primary-tinted kicker above the title (e.g. role / section). */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Right-aligned actions (buttons). */
  children?: ReactNode
  className?: string
}

function Header({ eyebrow, title, description, children, className }: HeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="text-sm font-medium text-primary">{eyebrow}</p> : null}
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  )
}

/**
 * Sticky form-footer actions — a right-aligned blurred bar that keeps the primary
 * action reachable on tall pages.
 */
function ActionBar({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 mt-2 flex items-center justify-end gap-2 rounded-xl p-2 ring-1 ring-border/60 backdrop-blur-md',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export const Page = { Root, Header, ActionBar }
