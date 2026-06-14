import { coordinationStreams, type WorkstreamRow } from '@/lib/workstreams'
import { PHASE_NAMES, phaseOf, type LoanApplication, type Stage } from '@/lib/types'

// The PIPELINE SPINE (P3-A of the RM-led redesign) — a DISPLAY-ONLY read model over the existing
// `stage` Int (Fork A1: NO authority inversion, NO engine change). The spine is the horizontal row
// of HANDOFF-SEGMENTS (the few points where control truly transfers) with the parallel checklist
// streams (lib/workstreams.ts) grouped beneath each. It NEVER writes, dispatches, mutates, gates,
// or renumbers the engine — same `app` always yields the same spine. Fully reversible.
//
// Design: docs/designs/rm-led-pipeline-redesign.md §1 (the spine = derived handoff-segments over
// stage Int: `Inisiasi → Risk Review → Keputusan Komite → SP3 → Pencairan`) + the Resolved-forks
// table (A1 defer authority inversion; A4 renders SP3/Pencairan display-only).
// ADR: decisions/0020-customer-entity-and-rm-led-pipeline.md §2.

export type SegmentId = 'inisiasi' | 'risk' | 'komite' | 'sp3' | 'pencairan'
export type SegmentState = 'done' | 'active' | 'upcoming'

export interface SpineSegment {
  id: SegmentId
  /** Handoff-segment name, e.g. 'Inisiasi' (Inisiasi pulls PHASE_NAMES[1] after the rename). */
  label: string
  /** The underlying engine-stage span, e.g. 'Tahap 1–3' / 'Tahap 4'. */
  stageLabel: string
  state: SegmentState
  /** SP3 + Pencairan are A4 display-only over the existing engine — no actions, rendered muted. */
  deferred?: boolean
  /** The parallel checklist streams (lib/workstreams.ts) that fall under this segment. */
  streams: WorkstreamRow[]
}

// The 5 handoff-segments over the 6 engine stages. `deferred` marks the A4 display-only segments
// (sp3/pencairan, both at stage 6). `stageLabel` is the engine-stage span in Bahasa.
interface SegmentSpec {
  id: SegmentId
  label: string
  stageLabel: string
  deferred?: boolean
  // The engine stages whose streams roll up under this segment.
  stages: Stage[]
}

const SEGMENT_SPECS: SegmentSpec[] = [
  // inisiasi = stages 1–3 (phaseOf === 1: intake → legal/agunan/biro → feasibility/MUAP).
  { id: 'inisiasi', label: PHASE_NAMES[1], stageLabel: 'Tahap 1–3', stages: [1, 2, 3] },
  // risk = stage 4 (Risk Review / RSK).
  { id: 'risk', label: 'Analisis Risiko', stageLabel: 'Tahap 4', stages: [4] },
  // komite = stage 5 (Keputusan Komite).
  { id: 'komite', label: 'Keputusan Komite', stageLabel: 'Tahap 5', stages: [5] },
  // sp3 = stage 6 PRE-disbursement (A4 display-only).
  { id: 'sp3', label: 'SP3', stageLabel: 'Tahap 6', deferred: true, stages: [6] },
  // pencairan = stage 6 disbursement (A4 display-only).
  { id: 'pencairan', label: 'Pencairan', stageLabel: 'Tahap 6', deferred: true, stages: [6] },
]

// Map an engine stage to its spine segment(s). Stage 6 fans out to both sp3 and pencairan; the
// per-segment state logic (segmentState) then splits which of the two is active via the disbursement
// sub-status. Stream grouping uses the segment a stage's streams belong to: stage-6 streams (the
// 'pencairan' workstream) attach to the 'pencairan' segment so the disbursement work surfaces there.
function segmentIdForStreamStage(stage: Stage): SegmentId {
  if (phaseOf(stage) === 1) return 'inisiasi' // stages 1–3
  if (stage === 4) return 'risk'
  if (stage === 5) return 'komite'
  return 'pencairan' // stage 6 streams (Pencairan workstream) land under the disbursement segment
}

// DERIVE (never write) a segment's state from app.stage. A segment is 'done' once the app has
// advanced PAST its stage span, 'active' while app.stage is within it, else 'upcoming'. The two
// stage-6 deferred segments (sp3/pencairan) split on app.disbursementStatus: sp3 is 'active' until
// disbursement begins ('Siap Cair'/'Cair' = releasing) then 'done'; pencairan is 'active' while
// disbursing. If the sub-status is absent/unknown at stage 6, both read 'active' (keep it simple +
// display-only). Reads only — no throw, no mutation.
function segmentState(spec: SegmentSpec, app: LoanApplication): SegmentState {
  const stage = app.stage
  const last = spec.stages[spec.stages.length - 1]
  const first = spec.stages[0]

  // Stage-6 deferred split (sp3 then pencairan).
  if (spec.id === 'sp3' || spec.id === 'pencairan') {
    if (stage < 6) return 'upcoming'
    // At stage 6: split on the disbursement sub-status. 'Siap Cair' / 'Cair' = the release is
    // under way → SP3 (the pre-disbursement prep) is done, Pencairan is active.
    const releasing = app.disbursementStatus === 'Siap Cair' || app.disbursementStatus === 'Cair'
    if (spec.id === 'sp3') return releasing ? 'done' : 'active'
    // pencairan
    return 'active'
  }

  if (stage > last) return 'done'
  if (stage >= first) return 'active'
  return 'upcoming'
}

/**
 * The pipeline spine for an application: the 5 handoff-segments, each with its derived state and the
 * parallel checklist streams grouped beneath it. PURE + DISPLAY-ONLY — reads app.stage + the derived
 * helpers (phaseOf / coordinationStreams), never writes/dispatches/mutates, never changes the engine
 * or any gate. Same app → same spine.
 */
export function pipelineSpine(app: LoanApplication): SpineSegment[] {
  const streams = coordinationStreams(app)
  // Group every stream under its segment by mapping the stream's underlying stage. coordinationStreams
  // preserves STREAM_SPECS order, so the grouped lists stay deterministic.
  const bySegment = new Map<SegmentId, WorkstreamRow[]>()
  for (const spec of SEGMENT_SPECS) bySegment.set(spec.id, [])
  // Group each stream under its segment via the stream's own engine stage (single source —
  // WorkstreamRow.stage, set from STREAM_SPECS in lib/workstreams.ts; no parallel lookup to drift).
  for (const stream of streams) {
    const segId = segmentIdForStreamStage(stream.stage)
    bySegment.get(segId)!.push(stream)
  }

  return SEGMENT_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    stageLabel: spec.stageLabel,
    state: segmentState(spec, app),
    deferred: spec.deferred,
    streams: bySegment.get(spec.id)!,
  }))
}
