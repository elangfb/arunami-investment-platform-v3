import type { ComponentType, ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Lock, XCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { StatusChip } from '@/components/shared/StatusChip'
import { checkpointPdfUrl } from '@/lib/docs-api'
import { decisionLabel, decisionTone } from '@/lib/komite'
import { formatRupiah } from '@/lib/sla-utils'
import type { KomiteVoteValue, LoanApplication } from '@/lib/types'

// Shape-distinct icon per decision (colour-blind-safe alongside the tone + label):
// check = approve, triangle = conditional, x = reject.
export const DECISION_ICON: Record<KomiteVoteValue, ComponentType<{ className?: string }>> = {
  approve: CheckCircle2,
  conditional: AlertTriangle,
  reject: XCircle,
}

// The one decision chip used everywhere a committee/vote/recommendation outcome is
// shown (seam card, voting room, decisions table, MUAP banner). Colour + shape +
// English label — never colour alone.
export function DecisionChip({ decision, size = 'sm' }: { decision: KomiteVoteValue; size?: 'sm' | 'md' }) {
  return <StatusChip tone={decisionTone[decision]} label={decisionLabel[decision]} icon={DECISION_ICON[decision]} size={size} />
}

const ROUTING: Record<KomiteVoteValue, string> = {
  approve: 'Fasilitas masuk tahap Pencairan.',
  conditional: 'Dikembalikan ke AO untuk tindak lanjut nasabah.',
  reject: 'Dikembalikan ke AO untuk komunikasi ke nasabah.',
}

// The recorded-decision card — the single source for "Keputusan Komite" once a
// decision exists. Calm-chip treatment: a neutral card whose only colour is the
// DecisionChip; routing line + approved terms + the frozen audit docs. Shared by
// the detail-page seam card and the per-app Ruang Komite so they never drift.
export function DecisionResult({ app, action }: { app: LoanApplication; action?: ReactNode }) {
  const decision = app.komiteDecision
  if (!decision) return null
  const showTerms = decision !== 'reject'
  const checkpoint = app.decisionCheckpoint

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Keputusan Komite</p>
            <DecisionChip decision={decision} />
          </div>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowRight className="size-3.5 shrink-0" /> {ROUTING[decision]}
          </p>
        </div>
        {action}
      </div>

      {showTerms && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Term label="Plafond disetujui" value={formatRupiah(app.approvedPlafond ?? app.requestedPlafond)} />
          <Term label="Tenor" value={`${app.approvedTenorMonths ?? app.requestedTenorMonths} bln`} />
          {app.approvedMarginRate != null && <Term label="Margin" value={`${app.approvedMarginRate}%`} />}
        </dl>
      )}

      {app.komiteDecisionNote && <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">{app.komiteDecisionNote}</p>}

      {checkpoint && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <p className="flex items-center gap-1.5 font-medium"><Lock className="size-3.5 shrink-0" /> Dokumen beku (audit)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dibekukan {new Date(checkpoint.decidedAt).toLocaleString('id-ID')} · SHA-256 <span className="tabular">{checkpoint.contentHash.slice(0, 12)}…</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <a href={checkpointPdfUrl(app.id, 'muap')} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>PDF MUAP</a>
            <a href={checkpointPdfUrl(app.id, 'rsk')} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>PDF RSK</a>
          </div>
        </div>
      )}
    </div>
  )
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
