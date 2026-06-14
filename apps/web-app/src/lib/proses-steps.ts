import { stage2SupportComplete, analysisComplete } from '@/lib/stage-action'
import type { DetailView } from '@/lib/detail-nav'
import type { LoanApplication, Role, Stage } from '@/lib/types'

// Single source of truth for the cross-role pipeline ("Proses") status, shared by
// the read-only ProsesRail (the flow visual) and DetailTabs (the navigation). One
// model so the two surfaces can never disagree — the handoff's "reuse the gate
// predicates so 'done' never forks" mandate. Status is derived from artifacts,
// not the raw stage number, and is monotonic (see computeStepStatuses).

export type StepStatus = 'done' | 'active' | 'upcoming'

export type ProsesStep = {
  label: string
  stage: Stage
  owners: Role[]
  // The detail-page view this step maps to, or null when it has no tab (Komite
  // lives in the seam card / the global /komite room, not a DetailView).
  view: DetailView | null
  // Done when the step's artifact exists — independent of the current stage, so a
  // post-decision rollback still reads as complete (audit-persistent).
  done: (app: LoanApplication) => boolean
  // Lag-aware: this step's work can legitimately continue PAST its nominal stage
  // (ADR-0007 — Legal/Appraisal lag into Stage 3 while the RM advances 2→3 on bureau
  // data). Its status then follows ONLY its own done-predicate — never the stage number
  // nor a later artifact — so it never shows "Selesai" while the deliverable is pending.
  canLag?: boolean
}

export const PROSES_STEPS: ProsesStep[] = [
  // Stage-1 RM intake (Pengajuan): done once the dossier moves past submission. Shares the
  // Dokumen/Data tabs share early origination: document intake, RM bureau data, and
  // Legal & Appraisal support. statusForView tie-breaks shared views to the latest
  // step (see findLastIndex below).
  { label: 'Pengajuan Dokumen', stage: 1, owners: ['RM'], view: 'documents', done: (app) => app.stage > 1 },
  { label: 'Legal, Agunan & Biro', stage: 2, owners: ['LG', 'RM'], view: 'documents', done: stage2SupportComplete, canLag: true },
  { label: 'Analisa', stage: 3, owners: ['RM'], view: 'data', done: (app) => analysisComplete(app) && app.financialsAssessed },
  { label: 'MUAP', stage: 3, owners: ['RM'], view: 'muap', done: (app) => Boolean(app.muapSyncedAt) },
  { label: 'RSK', stage: 4, owners: ['RA'], view: 'rsk', done: (app) => app.riskRecommendation !== null },
  { label: 'Komite', stage: 5, owners: ['CM'], view: null, done: (app) => Boolean(app.komiteDecision) },
  { label: 'Pencairan', stage: 6, owners: ['RM'], view: 'pencairan', done: (app) => app.disbursementStatus === 'Cair' },
]

// Indonesian status labels for tooltips / screen readers (a11y: never rely on
// colour alone). Kept here so rail and tabs use the same wording.
export const STATUS_LABEL: Record<StepStatus, string> = {
  done: 'selesai',
  active: 'sedang berjalan',
  upcoming: 'akan datang',
}

// Completion is monotonic: a step is reached (done) when its own artifact predicate
// holds, when the app has advanced past its stage, OR when any later step is already
// done. The last two clauses keep the flow chronologically coherent after a
// post-decision rollback — e.g. a Bersyarat/Tolak decision that resets the app to
// Stage 1 still shows every step up to Komite done, with no gap between completed
// steps. EXCEPTION: a `canLag` step (Legal/Appraisal under ADR-0007) ignores both the
// stage-number and later-artifact clauses — it can still be in progress at Stage 3, so
// its status tracks only its own done-predicate (otherwise the collapsed Stage-2 step
// shows "Selesai" while Analisa Yuridis is still pending). Only the first not-yet-reached
// step at or before the current stage is 'active'; everything after is 'upcoming'
// (subsumes same-stage order: MUAP stays upcoming until Analisa done).
export function computeStepStatuses(app: LoanApplication): StepStatus[] {
  const reached = PROSES_STEPS.map(
    (step, i) =>
      step.done(app) ||
      (!step.canLag &&
        (app.stage > step.stage ||
          PROSES_STEPS.slice(i + 1).some((later) => later.done(app)))),
  )
  const firstPending = reached.indexOf(false)
  return PROSES_STEPS.map((step, i) => {
    if (reached[i]) return 'done'
    if (i === firstPending && app.stage >= step.stage) return 'active'
    return 'upcoming'
  })
}

// Status for a single detail view, or undefined when the view is not a pipeline
// step (Berkas / Aktivitas surfaces, which carry no flow status). When a view is
// shared by more than one step (the Dokumen tab carries both Pengajuan and Legal
// & SLIK), resolve to the LATEST/most-advanced step — its status reflects the
// gating work still on that surface, not the upstream step already behind it.
export function statusForView(app: LoanApplication, view: DetailView): StepStatus | undefined {
  const index = PROSES_STEPS.findLastIndex((step) => step.view === view)
  if (index === -1) return undefined
  return computeStepStatuses(app)[index]
}
