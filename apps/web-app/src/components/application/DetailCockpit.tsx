'use client'

import { SLAChip } from '@/components/shared/SLAChip'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { ActionBand } from '@/components/application/ActionBand'
import { ReviewAdendumActions } from '@/components/application/ReviewAdendumActions'
import { ReviewDueChip } from '@/components/application/ReviewDueChip'
import { DecisionChip } from '@/components/komite/DecisionResult'
import { formatRupiah } from '@/lib/sla-utils'
import { activeOwnerNames } from '@/lib/stage-owners'
import type { DetailView } from '@/lib/detail-nav'
import type { LoanApplication } from '@/lib/types'

// The cockpit: the always-on top zone of the detail page. It answers "what is
// this case and what do I do" before the dossier answers "show me everything".
// Folds the old inline header + ProsesRail + ActionBand + KomiteSeamCard into one
// coherent block. The pipeline progress visual now lives in the Ringkasan pane
// and as status dots in the dossier nav, so the rail is gone from here.
export function DetailCockpit({
  app,
  onUpdate,
  onViewChange,
}: {
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  onViewChange: (v: DetailView) => void
}) {
  const decided = app.komiteDecision
  // Decided terms supersede the requested ones once the committee has set them;
  // when they DIFFER we show the requested value struck through so the change the
  // committee made is legible at a glance (no separate decision card needed).
  const plafond = app.approvedPlafond ?? app.requestedPlafond
  const tenor = app.approvedTenorMonths ?? app.requestedTenorMonths
  const margin = app.approvedMarginRate ?? app.marginRate
  const plafondPrev = decided && app.approvedPlafond != null && app.approvedPlafond !== app.requestedPlafond
    ? formatRupiah(app.requestedPlafond) : undefined
  const tenorPrev = decided && app.approvedTenorMonths != null && app.approvedTenorMonths !== app.requestedTenorMonths
    ? `${app.requestedTenorMonths} bln` : undefined
  const marginPrev = decided && app.approvedMarginRate != null && app.marginRate != null && app.approvedMarginRate !== app.marginRate
    ? `${app.marginRate}%` : undefined

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          {/* Identity */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">{app.id}</p>
              <SLAChip stage={app.stage} enteredStageAt={app.enteredStageAt} app={app} />
              {decided && <DecisionChip decision={decided} />}
              <ReviewDueChip app={app} />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-heading text-2xl font-semibold leading-tight">{app.nasabahName}</h1>
              <AkadBadge akad={app.akadType} />
            </div>
            <p className="text-sm text-muted-foreground">Owner · {activeOwnerNames(app)}</p>
          </div>

          {/* Key terms — plafond is the hero; committee-approved values supersede
              the requested ones, with the requested struck through when changed. */}
          <dl className="flex shrink-0 flex-wrap items-end gap-x-8 gap-y-3 rounded-lg bg-muted/40 px-4 py-3 lg:text-right">
            <Term label="Plafond" prev={plafondPrev} hero>{formatRupiah(plafond)}</Term>
            <Term label="Tenor" prev={tenorPrev}>{tenor} bln</Term>
            {margin != null && <Term label="Margin" prev={marginPrev}>{margin}%</Term>}
          </dl>
        </div>

        {/* Review/Adendum entry — start a new pipeline cycle from a live facility (P5 / Fork C9).
            Self-gates to an approved/disbursed facility + the intake desk; renders nothing otherwise
            (incl. its own top separator). */}
        <ReviewAdendumActions app={app} />
      </div>

      <ActionBand app={app} onUpdate={onUpdate} onViewChange={onViewChange} />
    </div>
  )
}

function Term({ label, hero, prev, children }: { label: string; hero?: boolean; prev?: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {prev != null && (
        <div className="text-xs leading-none text-muted-foreground/70 line-through tabular-nums" title="Diajukan">{prev}</div>
      )}
      <dd className={hero ? 'text-xl font-bold tabular-nums leading-tight' : 'font-semibold tabular-nums'}>
        {children}
      </dd>
    </div>
  )
}
