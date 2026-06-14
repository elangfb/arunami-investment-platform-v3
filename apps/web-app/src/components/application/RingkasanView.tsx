'use client'

import Link from 'next/link'
import { ArrowRight, Check, Lock } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { ScoreOverview } from './ScoreOverview'
import { CoordinationPanel } from './CoordinationPanel'
import { FacilityLineageCard } from './FacilityLineageCard'
import { CatatanKonteksEditor } from '@/components/ai-context/CatatanKonteksEditor'
import { renderDerivedPreview } from '@/lib/ai-context-cascade'
import { updateAppContextAction } from '@/server/actions/ai-context'
import { HardGateFlags } from '@/components/shared/HardGateFlags'
import { HardGateTile } from '@/components/shared/HardGateTile'
import { DecisionChip } from '@/components/komite/DecisionResult'
import { PROSES_STEPS, STATUS_LABEL, computeStepStatuses, type StepStatus } from '@/lib/proses-steps'
import { DEFAULT_RISK_POLICY } from '@/lib/hardGates'
import { generateAspectScores } from '@/lib/scoring'
import { checkpointPdfUrl } from '@/lib/docs-api'
import { compareHistory } from '@/lib/history'
import type { DetailView } from '@/lib/detail-nav'
import { cn } from '@/lib/utils'
import { phaseLabel, type KomiteVoteValue, type LoanApplication } from '@/lib/types'

// The Ringkasan ("summary") pane — the default dossier landing. It answers
// "where is this case and what does the analysis say" at a glance, for every
// role on every handoff. It deliberately does NOT repeat the cockpit (identity,
// terms, task, committee decision); it owns the pipeline stepper (the old rail)
// plus the analytical at-a-glance that was otherwise buried in Penilaian.
export function RingkasanView({
  app,
  onUpdate,
  onViewChange,
}: {
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  onViewChange: (v: DetailView) => void
}) {
  const statuses = computeStepStatuses(app)
  const scores = app.analysis.generated ? (app.analysis.scores ?? generateAspectScores(app)) : null
  // Hard gates are the financial-risk snapshot — meaningful only once financials are assessed.
  // Before that (intake / early Stage 2) the tiles would just read "Belum dinilai", so the whole
  // card is withheld rather than shown empty (ui-ux-review finding A2).
  const showHardGates = app.financialsAssessed

  return (
    <div className="space-y-4">
      {/* Committee decision — the verdict + terms live in the cockpit header; this is
          the audit residue (routing, committee note, frozen documents) for the catch-up. */}
      {app.komiteDecision && <KomiteDecisionSummary app={app} />}

      {/* Pipeline progress — the cross-role flow, now the home for step status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Proses</CardTitle>
          <CardAction><span className="text-xs font-medium text-primary">{phaseLabel(app.stage)}</span></CardAction>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {PROSES_STEPS.map((step, i) => {
              const status = statuses[i]
              const target = step.view
              const clickable = target !== null
              return (
                <li key={step.label} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => target && onViewChange(target)}
                    title={`${step.label} — ${STATUS_LABEL[status]}`}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors',
                      clickable ? 'hover:bg-muted cursor-pointer' : 'cursor-default',
                    )}
                  >
                    <StepMarker status={status} />
                    <div className="min-w-0">
                      <p className="whitespace-nowrap text-sm font-medium leading-none">{step.label}</p>
                      <p className="mt-1 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                        {step.owners.join('·')}
                      </p>
                    </div>
                  </button>
                  {/* Trailing connector: at a wrap point it sits at the row's end pointing onward,
                      not dangling at the next row's start. Hidden after the final step. */}
                  {i < PROSES_STEPS.length - 1 && (
                    <span className="hidden h-px w-6 bg-border sm:block" aria-hidden="true" />
                  )}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      {/* RM-coordination worktable — the parallel streams workable now (active + do-it-early) */}
      <CoordinationPanel app={app} onViewChange={onViewChange} />

      {scores && <ScoreOverview scores={scores} />}

      {(showHardGates || app.riskRecommendation) && (
        <div className={cn('grid gap-4', showHardGates && app.riskRecommendation && 'lg:grid-cols-2')}>
          {/* Hard gates — the compliance tripwires, shown once financials are assessed */}
          {showHardGates && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Indikator Hard Gate</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <HardGateTile label="DSR" assessed={app.financialsAssessed} value={`${app.hardGates.dsr}%`} threshold={`maks ${(app.riskPolicy ?? DEFAULT_RISK_POLICY).dsrMaxPct}%`} violated={app.financialsAssessed && app.hardGates.dsr > (app.riskPolicy ?? DEFAULT_RISK_POLICY).dsrMaxPct} />
                  <HardGateTile label="LTV" assessed={app.financialsAssessed} value={`${app.hardGates.ltv}%`} threshold={`maks ${(app.riskPolicy ?? DEFAULT_RISK_POLICY).ltvMaxPct}%`} violated={app.financialsAssessed && app.hardGates.ltv > (app.riskPolicy ?? DEFAULT_RISK_POLICY).ltvMaxPct} />
                  <HardGateTile label="Kol" assessed={app.kolEntered} value={String(app.hardGates.kol)} threshold={`maks ${(app.riskPolicy ?? DEFAULT_RISK_POLICY).kolMax}`} violated={app.kolEntered && app.hardGates.kol > (app.riskPolicy ?? DEFAULT_RISK_POLICY).kolMax} />
                </div>
                <HardGateFlags hardGates={app.hardGates} violations={app.hardGateViolations} policy={app.riskPolicy} />
              </CardContent>
            </Card>
          )}

          {/* Risk verdict — RA's recommendation, surfaced to every role */}
          {app.riskRecommendation && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">Rekomendasi Risiko <DecisionChip decision={app.riskRecommendation} /></CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{app.riskNote || 'Tidak ada catatan.'}</CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Catatan Pengajuan (konteks AI) — the app-scoped human "Catatan" (Application.contextMd),
          additive free-text injected into the AI context (RM-led redesign §5 / Topic 5). The AUTO
          derived block (app facts) is shown read-only above the editable note. Open to any participant
          (the server action attributes the write). On save the fresh aggregate updates the working copy. */}
      <CatatanKonteksEditor
        title="Catatan Pengajuan (konteks AI)"
        description="Catatan khusus pengajuan ini yang ikut dibaca asisten AI. Konteks otomatis di bawah dihasilkan sistem."
        autoBlock={renderDerivedPreview(app)}
        initialCatatan={app.contextMd ?? null}
        placeholder="Mis. konteks khusus pengajuan ini: struktur agunan, kondisi khusus nasabah, atau hal yang perlu diperhatikan analis…"
        onSave={async (catatan) => {
          const fresh = await updateAppContextAction(app.id, catatan)
          onUpdate(fresh)
          return fresh
        }}
      />

      {/* Review/adendum lineage (P5 / Topic 7) — the "Riwayat fasilitas" chain (root → … → head),
          shown only when this app is part of a lineage; the head is "ketentuan terkini". */}
      <FacilityLineageCard app={app} />

      {/* Recent cross-role activity — fills the catch-up pane with real audit content at any
          stage, with a bridge to the full Riwayat. Never invented filler. */}
      <RecentActivity app={app} onViewChange={onViewChange} />
    </div>
  )
}

function StepMarker({ status }: { status: StepStatus }) {
  const cls: Record<StepStatus, string> = {
    done: 'bg-success-subtle text-success-foreground ring-1 ring-success/15',
    active: 'bg-primary/10 text-primary ring-1 ring-primary/20',
    upcoming: 'bg-muted text-muted-foreground ring-1 ring-border',
  }
  return (
    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', cls[status])} aria-hidden="true">
      {status === 'done' ? <Check className="size-4" /> : status === 'active' ? <span className="size-2.5 rounded-full bg-current" /> : <span className="size-2.5 rounded-full ring-1 ring-current" />}
    </span>
  )
}

// Compact cross-role activity for the catch-up pane — the last few audit-trail entries with a
// bridge to the full Riwayat. Always present (every app has history), so the landing reads as
// intentional even early on. The full timeline + reasons live in the Riwayat tab.
function activityDot(entry: LoanApplication['history'][number]): string {
  const action = entry.action.toLowerCase()
  if (action.includes('created') || action.includes('dibuat')) return 'bg-info'
  if (entry.reason || action.includes('kembalikan') || action.includes('tolak') || action.includes('send back')) return 'bg-warning'
  return 'bg-success'
}

function activityTime(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(d))
}

function RecentActivity({ app, onViewChange }: { app: LoanApplication; onViewChange: (v: DetailView) => void }) {
  const recent = [...app.history].sort(compareHistory).slice(0, 4)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Aktivitas terkini</CardTitle>
        {recent.length > 0 && (
          <CardAction>
            <button type="button" onClick={() => onViewChange('history')} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Lihat semua <ArrowRight className="size-3.5" />
            </button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
        ) : (
          <ol className="space-y-3">
            {recent.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', activityDot(e))} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{e.action}</p>
                  <p className="text-xs text-muted-foreground">{e.userName} · {activityTime(e.timestamp)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

const DECISION_ROUTING: Record<KomiteVoteValue, string> = {
  approve: 'Fasilitas masuk tahap Pencairan.',
  conditional: 'Dikembalikan ke AO untuk tindak lanjut nasabah.',
  reject: 'Dikembalikan ke AO untuk komunikasi ke nasabah.',
}

// The committee outcome on the catch-up pane: verdict chip + routing + committee
// note + the frozen audit documents. The verdict + approved terms themselves live
// in the cockpit header, so this carries only the residue and the Ruang Komite bridge.
function KomiteDecisionSummary({ app }: { app: LoanApplication }) {
  const decision = app.komiteDecision
  if (!decision) return null
  const cp = app.decisionCheckpoint
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">Keputusan Komite <DecisionChip decision={decision} /></CardTitle>
          <Link href={`/applications/${app.id}/komite`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Lihat Ruang Komite <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="flex items-center gap-1 text-muted-foreground"><ArrowRight className="size-3.5 shrink-0" /> {DECISION_ROUTING[decision]}</p>
        {app.komiteDecisionNote && <p className="rounded-md bg-muted/40 px-3 py-2">{app.komiteDecisionNote}</p>}
        {cp && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground"><Lock className="size-3.5" /> Dokumen beku (audit)</p>
            <p className="mt-0.5">Dibekukan {new Date(cp.decidedAt).toLocaleString('id-ID')} · SHA-256 <span className="tabular">{cp.contentHash.slice(0, 12)}…</span></p>
            {cp.riskDsrMaxPct != null && cp.riskLtvMaxPct != null && cp.riskKolMax != null && (
              <p className="mt-0.5">
                Kebijakan risiko (beku): DSR ≤ {cp.riskDsrMaxPct}% · LTV ≤ {cp.riskLtvMaxPct}% · Kol ≤ {cp.riskKolMax} ·{' '}
                {cp.riskPolicyVersion != null ? `versi ${cp.riskPolicyVersion}` : 'versi default (kode)'}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-2">
              <a href={checkpointPdfUrl(app.id, 'muap')} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>PDF MUAP</a>
              <a href={checkpointPdfUrl(app.id, 'rsk')} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>PDF RSK</a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
