import { analysisComplete, docBlockers, legalAppraisalComplete, legalUnverified, stage2RmDataReady } from '@/lib/stage-action'
import type { DetailView } from '@/lib/detail-nav'
import type { LoanApplication, Role, Stage } from '@/lib/types'

// The RM-coordination worktable model (ADR-0007). Hijra runs origination WITHOUT a system today:
// the RM coordinates Legal, Appraisal, bureau data, and the MUAP draft IN PARALLEL and out of
// sequence (Sheets/Docs + WhatsApp/Jira), not as a strict wizard. PROSES_STEPS collapses all of
// Stage 2 into one "Legal, Agunan & Biro" step; this model EXPANDS the parallel reality so the
// landing reads as a coordinator's worktable — every concurrently-workable stream, with where to
// act. It NEVER forks "done": each stream's done-predicate is the SAME engine predicate the gates
// and PROSES_STEPS use (stage2 substreams roll up to stage2SupportComplete).

export type StreamState =
  | 'done' // the stream's artifact exists (engine predicate holds)
  | 'active' // it is this stream's turn (its stage is reached) and it is not done — work it now
  | 'early' // its stage is not reached yet, but its inputs are ready so it can be started early
  | 'upcoming' // a downstream stream waiting on upstream work

export interface WorkstreamRow {
  id: string
  label: string
  owners: Role[]
  // The underlying engine stage this stream belongs to (1-6). Single source for stage grouping —
  // e.g. the pipeline spine maps a stream to its handoff-segment via this, not a parallel lookup.
  stage: Stage
  // The detail-page view to jump to; null streams (Komite) navigate via `href` instead.
  view: DetailView | null
  href?: string
  state: StreamState
  // Short Indonesian status line shown when the stream is actionable (active/early).
  detail: string
}

interface StreamSpec {
  id: string
  label: string
  owners: Role[]
  view: DetailView | null
  href?: string
  stage: Stage
  done: (a: LoanApplication) => boolean
  detail: (a: LoanApplication) => string
  // True when the stream may be started before its nominal stage (the do-it-early window). Encodes
  // input-readiness, so we never invite work that has no inputs yet (e.g. RSK before a final MUAP).
  canStartEarly?: (a: LoanApplication) => boolean
}

// Stage 2 is the parallel heart: Legal (Analisa Yuridis) ∥ Appraisal (Penilaian) ∥ RM bureau data
// (SLIK/Kol) all run at once, and Legal/Appraisal can lag into Stage 3 (they gate MUAP→Risk, not the
// 2→3 advance). The 5C+1S analysis can begin as soon as the case is in Stage 2; MUAP drafting can
// begin once Legal & Appraisal are in. Everything downstream waits on its true upstream artifact.
const STREAM_SPECS: StreamSpec[] = [
  {
    id: 'dokumen',
    label: 'Berkas & Dokumen',
    owners: ['RM'],
    view: 'documents',
    stage: 1,
    done: (a) => a.stage > 1 || docBlockers(a).length === 0,
    detail: (a) => (docBlockers(a).length ? `${docBlockers(a).length} berkas wajib belum lengkap` : 'Lengkapi berkas wajib'),
  },
  {
    id: 'legal',
    label: 'Analisa Yuridis',
    owners: ['LG'],
    view: 'documents',
    stage: 2,
    done: (a) => Boolean(a.stage2LegalApproval?.verifiedByLG) && legalUnverified(a).length === 0,
    detail: (a) => (legalUnverified(a).length ? `${legalUnverified(a).length} dokumen menunggu verifikasi legal` : 'Kirim Analisa Yuridis'),
  },
  {
    id: 'penilaian',
    label: 'Penilaian Agunan',
    owners: ['LG'],
    view: 'data',
    stage: 2,
    done: (a) => Boolean(a.appraisalPath),
    detail: () => 'Rekam jalur & hasil penilaian agunan',
  },
  {
    id: 'biro',
    label: 'SLIK & Kolektibilitas',
    owners: ['RM'],
    view: 'data',
    stage: 2,
    done: (a) => stage2RmDataReady(a),
    detail: (a) => (a.kolEntered ? 'Kirim hasil SLIK' : 'Input SLIK & Kolektibilitas'),
  },
  {
    id: 'analisa',
    label: 'Analisa 5C+1S',
    owners: ['RM'],
    view: 'data',
    stage: 3,
    done: (a) => analysisComplete(a) && a.financialsAssessed,
    detail: () => 'Lengkapi analisa 5C+1S & input keuangan',
    canStartEarly: (a) => a.stage >= 2,
  },
  {
    id: 'muap',
    label: 'MUAP',
    owners: ['RM'],
    view: 'muap',
    stage: 3,
    done: (a) => Boolean(a.muapSyncedAt),
    detail: () => 'Susun & ajukan rantai persetujuan MUAP',
    canStartEarly: (a) => legalAppraisalComplete(a),
  },
  {
    id: 'rsk',
    label: 'Kajian Risiko (RSK)',
    owners: ['RA'],
    view: 'rsk',
    stage: 4,
    done: (a) => a.riskRecommendation !== null,
    detail: () => 'Tinjau risiko & beri rekomendasi',
  },
  {
    id: 'komite',
    label: 'Keputusan Komite',
    owners: ['CM'],
    view: null,
    href: '/komite',
    stage: 5,
    done: (a) => Boolean(a.komiteDecision),
    detail: (a) => (a.scheduledMeeting ? 'Menunggu keputusan komite' : 'Menunggu dijadwalkan ke sidang'),
  },
  {
    id: 'pencairan',
    label: 'Pencairan',
    owners: ['RM'],
    view: 'pencairan',
    stage: 6,
    done: (a) => a.disbursementStatus === 'Cair',
    detail: () => 'Proses pencairan fasilitas',
  },
]

function stateOf(spec: StreamSpec, app: LoanApplication): StreamState {
  if (spec.done(app)) return 'done'
  if (app.stage >= spec.stage) return 'active'
  if (app.stage < spec.stage && spec.canStartEarly?.(app)) return 'early'
  return 'upcoming'
}

// Every stream with its derived state. The landing's worktable filters this to the actionable rows
// (active + early); the full done/upcoming flow stays in the Proses stepper, so the two never fork.
export function coordinationStreams(app: LoanApplication): WorkstreamRow[] {
  return STREAM_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    owners: spec.owners,
    stage: spec.stage,
    view: spec.view,
    href: spec.href,
    state: stateOf(spec, app),
    detail: spec.detail(app),
  }))
}

// The worktable: the streams a coordinator can act on RIGHT NOW — its turn ('active') or startable
// ahead of time ('early'). Multiple at once is the point (the parallel reality). Empty once the case
// is terminal (closed/rejected with nothing in flight) — the landing then leans on the cockpit task.
export function activeWorkstreams(app: LoanApplication): WorkstreamRow[] {
  return coordinationStreams(app).filter((s) => s.state === 'active' || s.state === 'early')
}
