'use client'

import { ArrowRight, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { pipelineSpine, type SegmentState, type SpineSegment } from '@/lib/pipeline-spine'
import { cn } from '@/lib/utils'
import type { DetailView } from '@/lib/detail-nav'
import type { LoanApplication } from '@/lib/types'

// The PIPELINE SPINE (P3-A) — a DISPLAY-ONLY horizontal row of handoff-segments over the existing
// `stage` Int (Fork A1: no authority inversion, no engine change). It reads pipelineSpine(app) — a
// pure read model — and renders the 5 segments (Inisiasi → Analisis Risiko → Keputusan Komite → SP3
// → Pencairan) with a shape-coded status marker each and a count of active parallel streams. It
// NAVIGATES only (a segment with active streams surfaces them → onViewChange); it NEVER writes,
// dispatches, or mutates, and renders the A4-deferred SP3/Pencairan segments visibly display-only.
// Design: docs/designs/rm-led-pipeline-redesign.md §1.

const STATE_LABEL: Record<SegmentState, string> = {
  done: 'selesai',
  active: 'sedang berjalan',
  upcoming: 'akan datang',
}

export function PipelineSpine({
  app,
  onViewChange,
}: {
  app: LoanApplication
  onViewChange?: (v: DetailView) => void
}) {
  const segments = pipelineSpine(app)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Alur tahapan</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Responsive: a row with connectors on desktop, stacked rows on mobile. */}
        <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
          {segments.map((segment, i) => (
            <SegmentNode
              key={segment.id}
              segment={segment}
              isLast={i === segments.length - 1}
              onViewChange={onViewChange}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function SegmentNode({
  segment,
  isLast,
  onViewChange,
}: {
  segment: SpineSegment
  isLast: boolean
  onViewChange?: (v: DetailView) => void
}) {
  const activeStreams = segment.streams.filter((s) => s.state === 'active' || s.state === 'early')
  // Navigation-only: clicking surfaces the first active stream's view (if any). NO forms, NO writes.
  const target = activeStreams.find((s) => s.view)?.view ?? null
  const clickable = Boolean(target && onViewChange)

  const body = (
    <div
      className={cn(
        'flex h-full flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
        segment.deferred ? 'border-dashed border-border/60 bg-muted/30' : 'border-border/70',
        clickable && 'hover:bg-muted/50',
      )}
    >
      <div className="flex items-center gap-2">
        <SegmentMarker state={segment.state} />
        <p className={cn('min-w-0 truncate font-medium leading-none', segment.deferred && 'text-muted-foreground')}>
          {segment.label}
        </p>
      </div>
      <p className="text-[11px] leading-none text-muted-foreground">{segment.stageLabel}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {activeStreams.length > 0 ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
            {activeStreams.length} alur paralel
          </span>
        ) : (
          <span className="text-[10px] leading-none text-muted-foreground/70">{STATE_LABEL[segment.state]}</span>
        )}
        {segment.deferred && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground ring-1 ring-inset ring-border/60">
            tampilan
          </span>
        )}
        {clickable && <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />}
      </div>
    </div>
  )

  return (
    <li className="flex flex-1 flex-col sm:flex-row sm:items-stretch">
      {clickable ? (
        <button
          type="button"
          onClick={() => onViewChange?.(target as DetailView)}
          className={cn(buttonVariants({ variant: 'ghost' }), 'h-auto w-full flex-1 p-0 font-normal')}
        >
          {body}
        </button>
      ) : (
        <div className="w-full flex-1">{body}</div>
      )}
      {/* Connector — visible on desktop only; mobile rows simply stack. */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="hidden shrink-0 self-center px-1 text-muted-foreground/50 sm:inline-flex"
        >
          <ArrowRight className="size-4" />
        </span>
      )}
    </li>
  )
}

// Shape-coded status marker (WCAG 1.4.1 — never colour alone; mirrors CoordinationPanel's idiom):
// done = a filled check · active = a filled primary dot · upcoming = a dashed ring. The STATE_LABEL
// text beneath each segment carries the same signal redundantly.
function SegmentMarker({ state }: { state: SegmentState }) {
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full',
        state === 'done' && 'bg-primary text-primary-foreground',
        state === 'active' && 'bg-primary/10 ring-1 ring-primary/20',
        state === 'upcoming' && 'border border-dashed border-muted-foreground/50',
      )}
      aria-hidden="true"
    >
      {state === 'done' && <Check className="size-3" strokeWidth={3} />}
      {state === 'active' && <span className="size-2 rounded-full bg-primary" />}
      {state === 'upcoming' && <span className="size-1.5 rounded-full ring-1 ring-muted-foreground/50" />}
    </span>
  )
}
