'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight, FastForward, Megaphone, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { activeWorkstreams, type WorkstreamRow } from '@/lib/workstreams'
import { ROLE_SOP_CODE } from '@/lib/role-labels'
import { colekTargetForStream } from '@/lib/colek-streams'
import { runAction } from '@/lib/client-action'
import { canActOnDesk, hasDesk } from '@/lib/auth/can'
import { useActor } from '@/context/ActorProvider'
import { colekDeskAction, listColeksForAppAction, type ColekRow } from '@/server/actions/colek-actions'
import { cn } from '@/lib/utils'
import type { DetailView } from '@/lib/detail-nav'
import type { LoanApplication } from '@/lib/types'

// The RM-coordination worktable (ADR-0007). Hijra coordinates origination in PARALLEL and out of
// sequence — Legal, Appraisal, bureau data, and the MUAP draft all move at once, not down a wizard.
// This pane makes that legible on the landing: every stream a coordinator can act on RIGHT NOW —
// its turn ("active") or startable ahead of time ("early", the do-it-early window) — each with a
// one-click jump to where the work happens. It NAVIGATES only; the viewer's own gated forward
// action stays in the cockpit "Tugas Anda". Hidden once nothing is in flight (terminal cases).
//
// COLEK (design Follow-up-decisions "A1 colek"): a participant nudges another desk to do work on this
// app. Streams owned by a non-RM desk (Legal/Penilaian/Risiko — colek-streams.ts) carry a "Colek <desk>"
// button that fires colekDeskAction; an already-open colek shows its status instead. Gated to
// participants (canActOnDesk) or RM intake — the originator desks. The button IS the request (no nav).
export function CoordinationPanel({
  app,
  onViewChange,
}: {
  app: LoanApplication
  onViewChange: (v: DetailView) => void
}) {
  const actor = useActor()
  const streams = activeWorkstreams(app)
  // Colek affordances show only to participants on this app (or RM intake, the originator desk).
  const canColek = canActOnDesk(actor, app) || hasDesk(actor, 'intake')

  // Active (pending/in_progress) colek per targetDesk, fetched on mount + refreshed after a request.
  const [activeByDesk, setActiveByDesk] = useState<Record<string, ColekRow>>({})
  const refreshColeks = useCallback(() => {
    if (!canColek) return
    void runAction(
      () => listColeksForAppAction(app.id),
      (rows) => {
        const open: Record<string, ColekRow> = {}
        // Newest-first; keep the first (latest) non-terminal colek per desk.
        for (const r of rows) {
          if ((r.status === 'pending' || r.status === 'in_progress') && !open[r.targetDesk]) open[r.targetDesk] = r
        }
        setActiveByDesk(open)
      },
    )
  }, [app.id, canColek])
  useEffect(() => {
    refreshColeks()
  }, [refreshColeks])

  if (streams.length === 0) return null
  const parallel = streams.filter((s) => s.state === 'active').length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Alur kerja</CardTitle>
        {parallel > 1 && (
          <CardAction>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {parallel} alur paralel
            </span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {streams.map((s) => (
            <StreamRow
              key={s.id}
              stream={s}
              onViewChange={onViewChange}
              canColek={canColek}
              activeColek={activeByDesk[colekTargetForStream(s.id)?.desk ?? '']}
              appId={app.id}
              onColeked={refreshColeks}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function StreamRow({
  stream,
  onViewChange,
  canColek,
  activeColek,
  appId,
  onColeked,
}: {
  stream: WorkstreamRow
  onViewChange: (v: DetailView) => void
  canColek: boolean
  activeColek: ColekRow | undefined
  appId: string
  onColeked: () => void
}) {
  const early = stream.state === 'early'
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <StreamMarker early={early} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium leading-none">{stream.label}</p>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
              {stream.owners.map((r) => ROLE_SOP_CODE[r]).join('·')}
            </span>
            {early && (
              <span className="inline-flex items-center gap-1 rounded-full bg-info-subtle px-1.5 py-0.5 text-[10px] font-medium leading-none text-info-foreground ring-1 ring-inset ring-info/15">
                <FastForward className="size-3" aria-hidden="true" /> Bisa lebih awal
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{stream.detail}</p>
          <ColekControl stream={stream} canColek={canColek} activeColek={activeColek} appId={appId} onColeked={onColeked} />
        </div>
      </div>
      <StreamAction stream={stream} onViewChange={onViewChange} />
    </li>
  )
}

// The colek affordance for a non-RM stream: a "Colek <desk>" request button, or — when a colek is
// already open for that desk — a read-only status chip (no second request; the backend is sticky, but
// the UI shouldn't even invite a duplicate). RM-owned streams + Komite have no target → renders nothing.
function ColekControl({
  stream,
  canColek,
  activeColek,
  appId,
  onColeked,
}: {
  stream: WorkstreamRow
  canColek: boolean
  activeColek: ColekRow | undefined
  appId: string
  onColeked: () => void
}) {
  const [pending, startTransition] = useTransition()
  const target = colekTargetForStream(stream.id)
  if (!target || !canColek) return null

  if (activeColek) {
    const label = activeColek.status === 'in_progress' ? 'sedang dikerjakan' : 'menunggu'
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-info-subtle px-2 py-0.5 text-[11px] font-medium text-info-foreground ring-1 ring-inset ring-info/15">
        <Check className="size-3" aria-hidden="true" />
        Colek {target.deskLabel} {label} · {activeColek.assigneeName}
      </p>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() =>
          runAction(
            () => colekDeskAction(appId, target.desk, target.description),
            (row) => {
              toast.success(`Colek terkirim ke ${row.assigneeName}`)
              onColeked()
            },
          ),
        )
      }
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mt-2 h-7 gap-1.5 px-2 text-xs text-primary')}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Megaphone className="size-3.5" aria-hidden="true" />}
      Colek {target.deskLabel}
    </button>
  )
}

// Active vs early differ by SHAPE, not colour alone (WCAG 1.4.1): active = a filled primary dot;
// early = a dashed ring. The "Bisa lebih awal" text tag carries the same signal redundantly.
function StreamMarker({ early }: { early: boolean }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
        early ? 'border border-dashed border-muted-foreground/50' : 'bg-primary/10 ring-1 ring-primary/20',
      )}
      aria-hidden="true"
    >
      {early ? (
        <span className="size-1.5 rounded-full ring-1 ring-muted-foreground/50" />
      ) : (
        <span className="size-2 rounded-full bg-primary" />
      )}
    </span>
  )
}

function StreamAction({ stream, onViewChange }: { stream: WorkstreamRow; onViewChange: (v: DetailView) => void }) {
  const label = 'Buka'
  const cls = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 self-start sm:self-auto')
  if (stream.view) {
    return (
      <button type="button" className={cls} onClick={() => onViewChange(stream.view as DetailView)}>
        {label} <ArrowRight className="size-3.5" />
      </button>
    )
  }
  if (stream.href) {
    return (
      <Link href={stream.href} className={cls}>
        {label} <ArrowRight className="size-3.5" />
      </Link>
    )
  }
  return null
}
