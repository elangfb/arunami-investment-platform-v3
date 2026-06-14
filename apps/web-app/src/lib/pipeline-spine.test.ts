import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pipelineSpine, type SegmentId, type SegmentState } from './pipeline-spine'
import type { LoanApplication, Stage } from './types'

// Behaviour under test: the PIPELINE SPINE (P3-A) — a DISPLAY-ONLY read model over the existing
// `stage` Int (Fork A1: no authority inversion, no engine change). The 5 handoff-segments
// (Inisiasi → Analisis Risiko → Keputusan Komite → SP3 → Pencairan) derive their state from
// app.stage; the parallel checklist streams (lib/workstreams.ts) group under the right segment;
// SP3/Pencairan are A4 display-only (deferred:true). The model is PURE — same app → same spine,
// reads only, never throws/mutates. Segment mapping: docs/designs/rm-led-pipeline-redesign.md §1.

function makeApp(over: Partial<LoanApplication> = {}): LoanApplication {
  const now = new Date()
  return {
    id: 'FOS-T', nasabahName: 'N', nasabahType: 'individual', phoneNumber: '0', akadType: 'Murabahah',
    requestedPlafond: 1, requestedTenorMonths: 12, purpose: 'p', stage: 1 as Stage, assignments: [],
    enteredStageAt: now, createdAt: now, createdBy: 't', hardGates: { dsr: 0, ltv: 0, kol: 1 },
    hardGateViolations: [], kolEntered: false, financialsAssessed: false, stage2LegalApproval: null,
    stage2SlikApproval: null,
    financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: null },
    marginRate: null, documents: [], history: [],
    analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '', generated: false },
    komiteVotes: [], riskRecommendation: null, aiChatHistory: [],
    ...over,
  }
}

const stateOf = (app: LoanApplication, id: SegmentId): SegmentState | undefined =>
  pipelineSpine(app).find((s) => s.id === id)?.state

const stateMap = (app: LoanApplication): Record<SegmentId, SegmentState> =>
  Object.fromEntries(pipelineSpine(app).map((s) => [s.id, s.state])) as Record<SegmentId, SegmentState>

test('the spine is exactly the 5 handoff-segments in order, with Inisiasi labelled from the phase rename', () => {
  const spine = pipelineSpine(makeApp())
  assert.deepEqual(spine.map((s) => s.id), ['inisiasi', 'risk', 'komite', 'sp3', 'pencairan'])
  assert.equal(spine[0].label, 'Inisiasi', 'Inisiasi pulls PHASE_NAMES[1] after the Originasi→Inisiasi rename')
  assert.equal(spine[0].stageLabel, 'Tahap 1–3', 'Inisiasi spans engine stages 1–3 (phaseOf === 1)')
})

test('Stage 1: only Inisiasi is active; everything downstream is upcoming', () => {
  assert.deepEqual(stateMap(makeApp({ stage: 1 as Stage })), {
    inisiasi: 'active', risk: 'upcoming', komite: 'upcoming', sp3: 'upcoming', pencairan: 'upcoming',
  })
})

test('Stage 3 (still inside Inisiasi): Inisiasi active, all downstream upcoming', () => {
  assert.deepEqual(stateMap(makeApp({ stage: 3 as Stage })), {
    inisiasi: 'active', risk: 'upcoming', komite: 'upcoming', sp3: 'upcoming', pencairan: 'upcoming',
  })
})

test('Stage 4 → Inisiasi done, Risk active, Komite upcoming', () => {
  const m = stateMap(makeApp({ stage: 4 as Stage }))
  assert.equal(m.inisiasi, 'done')
  assert.equal(m.risk, 'active')
  assert.equal(m.komite, 'upcoming')
  assert.equal(m.sp3, 'upcoming')
  assert.equal(m.pencairan, 'upcoming')
})

test('Stage 5 → Inisiasi + Risk done, Komite active, post-decision segments upcoming', () => {
  const m = stateMap(makeApp({ stage: 5 as Stage }))
  assert.equal(m.inisiasi, 'done')
  assert.equal(m.risk, 'done')
  assert.equal(m.komite, 'active')
  assert.equal(m.sp3, 'upcoming')
  assert.equal(m.pencairan, 'upcoming')
})

test('Stage 6 pre-disbursement: SP3 + Pencairan both active (no sub-status to split yet)', () => {
  const m = stateMap(makeApp({ stage: 6 as Stage }))
  assert.equal(m.inisiasi, 'done')
  assert.equal(m.risk, 'done')
  assert.equal(m.komite, 'done')
  assert.equal(m.sp3, 'active')
  assert.equal(m.pencairan, 'active')
})

test('Stage 6 once the release is under way (Siap Cair / Cair): SP3 done, Pencairan active', () => {
  assert.equal(stateOf(makeApp({ stage: 6 as Stage, disbursementStatus: 'Siap Cair' }), 'sp3'), 'done')
  assert.equal(stateOf(makeApp({ stage: 6 as Stage, disbursementStatus: 'Siap Cair' }), 'pencairan'), 'active')
  assert.equal(stateOf(makeApp({ stage: 6 as Stage, disbursementStatus: 'Cair' }), 'sp3'), 'done')
  // Early sub-statuses do not yet count as releasing → SP3 still active.
  assert.equal(stateOf(makeApp({ stage: 6 as Stage, disbursementStatus: 'Verifikasi Final' }), 'sp3'), 'active')
})

test('SP3 and Pencairan always carry deferred:true (A4 display-only); the upstream three do not', () => {
  const spine = pipelineSpine(makeApp({ stage: 6 as Stage }))
  const deferred = Object.fromEntries(spine.map((s) => [s.id, Boolean(s.deferred)]))
  assert.deepEqual(deferred, { inisiasi: false, risk: false, komite: false, sp3: true, pencairan: true })
})

test('streams group under the right segment by their underlying stage', () => {
  const app = makeApp({ stage: 2 as Stage })
  const spine = pipelineSpine(app)
  const ids = (seg: SegmentId) => spine.find((s) => s.id === seg)!.streams.map((s) => s.id)
  // Inisiasi = stages 1–3 streams; Risk = stage-4 stream; Komite = stage-5; Pencairan = stage-6.
  assert.deepEqual(ids('inisiasi'), ['dokumen', 'legal', 'penilaian', 'biro', 'analisa', 'muap'])
  assert.deepEqual(ids('risk'), ['rsk'])
  assert.deepEqual(ids('komite'), ['komite'])
  assert.deepEqual(ids('sp3'), [], 'sp3 carries no checklist streams (display-only)')
  assert.deepEqual(ids('pencairan'), ['pencairan'])
  // Every stream is grouped exactly once across all segments.
  const total = spine.reduce((n, s) => n + s.streams.length, 0)
  assert.equal(total, 9)
})

test('pure + display-only: same app → same spine, reads only (no throw)', () => {
  const app = makeApp({ stage: 4 as Stage })
  const a = pipelineSpine(app)
  const b = pipelineSpine(app)
  assert.deepEqual(a.map((s) => ({ id: s.id, state: s.state })), b.map((s) => ({ id: s.id, state: s.state })))
  // The input aggregate is not mutated by deriving the spine.
  assert.equal(app.stage, 4)
  assert.doesNotThrow(() => pipelineSpine(makeApp({ stage: 6 as Stage })))
})
