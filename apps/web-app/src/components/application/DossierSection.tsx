import type { ComponentType, ReactNode } from 'react'
import { CheckCircle2, Circle, CircleDot, Lock } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/shared/StatusChip'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { dedupeOwnersBySop } from '@/lib/role-labels'
import type { StepStatus } from '@/lib/proses-steps'
import type { Role } from '@/lib/types'

// The unifying frame for EVERY dossier tab. Before this, each tab invented its own
// header, status pill, and lock banner (6 colour systems, 4 lock patterns), so the
// detail page read as separate pieces. One frame → one structure / UI / UX:
//   header  = icon · title · pipeline-status chip · owner role badge(s) · actions
//   note    = one line: what this section is / whose job
//   lock    = a single read-only banner (stage-move immutability or role gate)
// Status uses the SAME done/active/upcoming vocabulary as the nav dots + Ringkasan
// stepper (lib/proses-steps), via the shared colour-blind-safe StatusChip.

const STATUS_META: Record<StepStatus, { tone: StatusTone; label: string; icon: ComponentType<{ className?: string }> }> = {
  done: { tone: 'success', label: 'Selesai', icon: CheckCircle2 },
  active: { tone: 'info', label: 'Berjalan', icon: CircleDot },
  upcoming: { tone: 'neutral', label: 'Menunggu', icon: Circle },
}

export function DossierSection({
  icon: Icon,
  title,
  owners,
  status,
  locked,
  note,
  actions,
  children,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  /** Role(s) responsible for this section — rendered as RoleBadge(s). */
  owners?: Role[]
  /** Pipeline status from lib/proses-steps (statusForView). Omit for non-pipeline tabs. */
  status?: StepStatus
  /** When set, renders ONE consistent read-only banner with this reason. */
  locked?: ReactNode
  /** One-line "what this is / whose job". */
  note?: ReactNode
  /** Right-aligned header actions (e.g. an Edit toggle). */
  actions?: ReactNode
  children: ReactNode
}) {
  const meta = status ? STATUS_META[status] : null
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
            <h2 className="font-heading text-lg font-semibold leading-tight">{title}</h2>
            {meta && <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />}
            {owners && dedupeOwnersBySop(owners).map((r) => <RoleBadge key={r} role={r} />)}
          </div>
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {locked && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" /> {locked}
        </div>
      )}
      {children}
    </section>
  )
}
