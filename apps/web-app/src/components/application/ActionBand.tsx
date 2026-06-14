'use client'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StageTransitionModal } from '@/components/shared/StageTransitionModal'
import { useStageAction } from '@/hooks/useStageAction'
import { stageActions, type ActionDescriptor, type StageActionModel, type StageFormKind } from '@/lib/stage-action'
import { isDetailView, VIEW_LABELS, type DetailView } from '@/lib/detail-nav'
import type { LoanApplication, Role } from '@/lib/types'
import { ROLE_SOP_LABEL } from '@/lib/role-labels'

interface ActionBandProps {
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  onViewChange: (v: DetailView) => void
}

// Indonesian label per pipeline role — shown as a row header when the actor can act in
// MORE than one role at this stage. Uses the SOP role vocabulary (RM/RA/…) — SSOT in
// lib/role-labels.ts; the legacy enum codes still back the matrix (deferred Phase-1 fold).
const ROLE_LABEL = ROLE_SOP_LABEL

// Where each stage form actually lives now: the cockpit only DIRECTS to the work
// surface (keeps "Tugas Anda" short); the heavy form lives in its dossier tab.
const FORM_TARGET: Record<StageFormKind, { view: DetailView; label: string }> = {
  'risk-recommendation': { view: 'rsk', label: 'Buka Kajian Risiko' },
}

// Extract an in-app ?view= target from a same-page href (else null = cross-route).
function inAppView(href?: string): DetailView | null {
  if (!href) return null
  const m = href.match(/[?&]view=([^&]+)/)
  return m && isDetailView(m[1]) ? (m[1] as DetailView) : null
}

// The persistent "Tugas Anda" pane under the detail header. Capability-based: ONE task per
// pipeline role the actor can act as at the current stage. It carries only REAL actions (a
// transition or a direct server action) — navigation-to-a-tab belongs in Alur kerja
// (CoordinationPanel), never here. Heavy forms (legal per-doc review, risk recommendation) live
// in their tabs, reached via onViewChange. Single role = a card; multi-desk = grouped rows.
export function ActionBand({ app, onUpdate, onViewChange }: ActionBandProps) {
  const sa = useStageAction(app, onUpdate)
  // Show a task ONLY when the actor has something to DO here: they own a desk at
  // this stage AND the task is actionable (a primary action or an inline form).
  // A "done, just waiting" state has neither → it drops off. Pure observers own
  // nothing → nothing renders (their context lives in the hero + Ringkasan). This
  // keeps the post-hero zone a quick-action card, hidden once the work is done.
  const owned = sa.roles
    .map((role) => ({ role, model: stageActions(app, role) }))
    .filter((m) => m.model.isOwner && (m.model.primary || m.model.form))

  if (!owned.length) return null

  const multi = owned.length > 1

  return (
    <>
      {multi ? (
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-accent/40 shadow-[var(--shadow-card)]">
          <p className="border-b border-primary/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Tugas Anda · {owned.length} peran
          </p>
          <div className="divide-y divide-primary/10">
            {owned.map(({ role, model }) => (
              <TaskRow key={role} role={role} model={model} sa={sa} onViewChange={onViewChange} variant="row" />
            ))}
          </div>
        </div>
      ) : (
        <TaskRow role={owned[0].role} model={owned[0].model} sa={sa} onViewChange={onViewChange} variant="card" />
      )}
      <StageTransitionModal
        open={sa.transition !== null}
        onOpenChange={(open) => !open && sa.closeTransition()}
        action={sa.transition?.action ?? ''}
        requireReason={sa.transition?.requireReason ?? false}
        onConfirm={sa.confirmTransition}
      />
    </>
  )
}

function TaskRow({
  role,
  model,
  sa,
  onViewChange,
  variant,
}: {
  role: Role
  model: StageActionModel
  sa: ReturnType<typeof useStageAction>
  onViewChange: (v: DetailView) => void
  variant: 'card' | 'row'
}) {
  const isRow = variant === 'row'
  // A form-stage becomes a directive button to the tab that owns the form.
  const directive = model.form ? FORM_TARGET[model.form] : null
  // Grammar: directive + one forward action + an optional return counterpart. Compact layout —
  // title on the left, the [proceed | send-back] pair on the right. No sub-forms, no blocker wall:
  // a disabled primary shows one short category line; the detail lives in its tab.
  const ret = model.returnAction
  const blockerSummary = model.primary?.disabled ? model.primary.blockerSummary : undefined

  return (
    <div className={isRow ? 'p-4' : 'rounded-xl border border-primary/30 bg-accent/40 p-4 shadow-[var(--shadow-card)]'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
            {isRow ? ROLE_LABEL[role] : 'Tugas Anda'}
          </p>
          <p className="mt-0.5 font-medium leading-snug">{model.taskTitle}</p>
          {model.subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{model.subtitle}</p>}
          {blockerSummary && <p className="mt-0.5 text-xs text-muted-foreground">{blockerSummary}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {directive && (
            <Button onClick={() => onViewChange(directive.view)}>
              {directive.label} <ArrowRight className="size-4" />
            </Button>
          )}
          {model.primary && <PrimaryAction d={model.primary} sa={sa} onViewChange={onViewChange} />}
          {ret && (
            <Button variant={ret.variant} disabled={ret.disabled} onClick={() => ret.transition && sa.openTransition(ret.transition)}>
              {ret.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Renders the primary action: an in-app ?view link switches the dossier view (no full
// nav); a cross-route href is a real link; otherwise it opens a stage transition.
function PrimaryAction({ d, sa, onViewChange }: { d: ActionDescriptor; sa: ReturnType<typeof useStageAction>; onViewChange: (v: DetailView) => void }) {
  // Named server action: the band owns the action; the prerequisite work lives in `workView`
  // (rendered as a secondary "Buka …" link). Tugas Anda stays a directive + the action.
  if (d.action) {
    const run = d.action === 'complete-legal' ? sa.saveLegalApproval : sa.completeSlik
    return (
      <>
        {d.workView && (
          <Button variant="outline" onClick={() => onViewChange(d.workView!)}>Buka {VIEW_LABELS[d.workView]}</Button>
        )}
        <Button variant={d.variant} disabled={d.disabled || sa.isPending} onClick={run}>{d.label}</Button>
      </>
    )
  }
  const v = inAppView(d.href)
  if (v) {
    return <Button variant={d.variant} disabled={d.disabled} onClick={() => onViewChange(v)}>{d.label}</Button>
  }
  if (d.href) {
    return <Link href={d.href}><Button variant={d.variant}>{d.label}</Button></Link>
  }
  return (
    <Button variant={d.variant} disabled={d.disabled} onClick={() => d.transition && sa.openTransition(d.transition)}>
      {d.label}
    </Button>
  )
}
