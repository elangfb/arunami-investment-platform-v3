'use client'

import { Check, LayoutGrid } from 'lucide-react'
import { GROUPS, VIEW_LABELS, viewsOf, type DetailGroup, type DetailView } from '@/lib/detail-nav'
import { statusForView, STATUS_LABEL, type StepStatus } from '@/lib/proses-steps'
import { dataAttentionCount } from '@/lib/provenance'
import { useActor } from '@/context/ActorProvider'
import { canActOnDesk } from '@/lib/auth/can'
import { cn } from '@/lib/utils'
import type { LoanApplication } from '@/lib/types'

// The dossier's left navigation: a grouped list of every surface, each pipeline
// view carrying its own status dot (one source: lib/proses-steps). Replaces the
// two-level tab maze AND the separate rail — "where am I" and "where do I go" in
// one element. Nothing is gated: every surface stays one click away for audit.
export function DossierNav({
  app,
  view,
  onViewChange,
}: {
  app: LoanApplication
  view: DetailView
  onViewChange: (v: DetailView) => void
}) {
  const actor = useActor()
  // A step's "active/pending" dot is a call-to-action — show it only to a viewer who can
  // act on the current stage. Others (e.g. AO looking at Stage-2 work) get no pending dot,
  // so the nav never signals false urgency. The done ✓ trail stays visible to everyone.
  const viewerCanAct = canActOnDesk(actor, app)
  return (
    <nav aria-label="Bagian aplikasi" className="space-y-4 text-sm">
      <NavRow
        label="Ringkasan"
        icon={<LayoutGrid className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        active={view === 'ringkasan'}
        onClick={() => onViewChange('ringkasan')}
      />

      {GROUPS.map((g) => (
        <div key={g.id} className="space-y-0.5">
          <div className="flex items-center gap-1.5 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
            <GroupDot status={groupStatus(app, g.id)} canAct={viewerCanAct} />
          </div>
          {g.views.map((v) => {
            const status = statusForView(app, v)
            const showDot = status === 'done' || (status === 'active' && viewerCanAct)
            // Single Data-nav count badge: N fields needing owner attention (OCR review or
            // required-but-empty data; not the advance gate). Pairs the count with a label.
            const attention = v === 'data' ? dataAttentionCount(app) : 0
            return (
              <NavRow
                key={v}
                label={VIEW_LABELS[v]}
                active={view === v}
                title={status && showDot ? `${VIEW_LABELS[v]} — ${STATUS_LABEL[status]}` : undefined}
                trailing={
                  <span className="flex items-center gap-1.5">
                    {attention > 0 && <CountBadge count={attention} />}
                    {showDot && status && <StatusDot status={status} />}
                  </span>
                }
                onClick={() => onViewChange(v)}
              />
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function NavRow({
  label,
  icon,
  trailing,
  active,
  title,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  trailing?: React.ReactNode
  active: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors',
        active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </button>
  )
}

// Roll-up for a group header: active if any pipeline view is the active step,
// done once all are done, otherwise nothing (Berkas/Aktivitas carry no status).
function groupStatus(app: LoanApplication, group: DetailGroup): StepStatus | undefined {
  const statuses = viewsOf(group)
    .map((v) => statusForView(app, v))
    .filter((s): s is StepStatus => s !== undefined)
  if (statuses.length === 0) return undefined
  if (statuses.includes('active')) return 'active'
  if (statuses.every((s) => s === 'done')) return 'done'
  return undefined
}

// Count of fields needing attention in Data (OCR suggestions or required-but-empty values).
// A number + an accessible label — never colour alone (WCAG 1.4.1).
function CountBadge({ count }: { count: number }) {
  return (
    <span
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-info-subtle px-1.5 text-xs font-semibold tabular-nums text-info-foreground ring-1 ring-inset ring-info/15"
      title={`${count} kolom perlu ditinjau atau dilengkapi`}
      aria-label={`${count} kolom perlu ditinjau atau dilengkapi`}
    >
      {count}
    </span>
  )
}

function GroupDot({ status, canAct }: { status?: StepStatus; canAct: boolean }) {
  if (!status) return null
  if (status === 'active' && !canAct) return null
  return <StatusDot status={status} />
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === 'done') return <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
  if (status === 'active') return <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
  return <span className="size-1.5 rounded-full ring-1 ring-muted-foreground/40" aria-hidden="true" />
}
