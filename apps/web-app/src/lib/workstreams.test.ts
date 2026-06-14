import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeWorkstreams, coordinationStreams } from './workstreams'
import type { ApplicationDocument, LoanApplication, Stage } from './types'

// Behaviour under test: the RM-coordination worktable (ADR-0007). Stage 2 runs three streams in
// PARALLEL; Legal/Appraisal may LAG into Stage 3 (they gate MUAP→Risk, not the 2→3 advance); the
// 5C+1S analysis is startable EARLY; downstream streams stay upcoming until their true upstream is
// in. "done" must track the same engine predicates the gates use (never a fork).

function doc(p: Partial<ApplicationDocument>): ApplicationDocument {
  return { id: 'd', name: 'Doc', docType: 'other', status: 'uploaded', required: true, legalVerification: 'pass', ...p }
}

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

const state = (app: LoanApplication, id: string) => coordinationStreams(app).find((s) => s.id === id)?.state
const activeIds = (app: LoanApplication) => activeWorkstreams(app).map((s) => s.id)

test('Stage 2: Legal, Penilaian, and Biro run in parallel; 5C+1S is startable early', () => {
  const app = makeApp({ stage: 2 as Stage })
  const ids = activeIds(app)
  assert.deepEqual([state(app, 'legal'), state(app, 'penilaian'), state(app, 'biro')], ['active', 'active', 'active'])
  assert.equal(state(app, 'analisa'), 'early', '5C+1S can begin once the case is in Stage 2')
  assert.ok(ids.includes('legal') && ids.includes('penilaian') && ids.includes('biro') && ids.includes('analisa'))
  // Downstream stays upcoming (not actionable): RSK needs a final MUAP, Komite needs RSK.
  assert.equal(state(app, 'rsk'), 'upcoming')
  assert.equal(state(app, 'komite'), 'upcoming')
  assert.equal(activeIds(app).includes('rsk'), false)
})

test('Stage 3 with Legal still pending: Legal LAGS as active alongside MUAP work (ADR-0007)', () => {
  const app = makeApp({ stage: 3 as Stage, stage2LegalApproval: null })
  assert.equal(state(app, 'legal'), 'active', 'legal continues to gate MUAP→Risk, so it stays active at Stage 3')
  assert.equal(state(app, 'analisa'), 'active')
  assert.equal(state(app, 'muap'), 'active')
})

test('Legal stream is done only when LG signed off AND every legal doc passed (engine predicate)', () => {
  const signedNotVerified = makeApp({ stage: 2 as Stage, stage2LegalApproval: { verifiedByLG: true }, documents: [doc({ id: 'a', legalVerification: 'fail' })] })
  assert.equal(state(signedNotVerified, 'legal'), 'active', 'a failing legal doc keeps the stream open')
  const done = makeApp({ stage: 2 as Stage, stage2LegalApproval: { verifiedByLG: true }, documents: [doc({ id: 'a', legalVerification: 'pass' })] })
  assert.equal(state(done, 'legal'), 'done')
  // P3-D §4 back-compat: a structured opinion (incl. 'tidak-layak') does NOT change stream state —
  // completion (verifiedByLG) drives it, the verdict is a signal. Same 'done' as the bare shape.
  const tidakLayak = makeApp({ stage: 2 as Stage, stage2LegalApproval: { verifiedByLG: true, opinion: 'tidak-layak', catatan: ['agunan bermasalah'] }, documents: [doc({ id: 'a', legalVerification: 'pass' })] })
  assert.equal(state(tidakLayak, 'legal'), 'done', 'a tidak-layak opinion still completes the Legal stream (verdict does not gate)')
})

test('Biro (SLIK + Kol) done only when SLIK verified AND Kol entered; MUAP startable early once Legal & Appraisal in', () => {
  const partial = makeApp({ stage: 2 as Stage, stage2SlikApproval: { verifiedByRT: true }, kolEntered: false })
  assert.equal(state(partial, 'biro'), 'active', 'SLIK alone without Kol is not done')
  const full = makeApp({ stage: 2 as Stage, stage2SlikApproval: { verifiedByRT: true }, kolEntered: true })
  assert.equal(state(full, 'biro'), 'done')
  // Legal & Appraisal complete at Stage 2 → MUAP becomes early-startable (do-it-ahead).
  const ready = makeApp({ stage: 2 as Stage, stage2LegalApproval: { verifiedByLG: true }, appraisalPath: 'internal', documents: [] })
  assert.equal(state(ready, 'muap'), 'early')
})

test('Pencairan stream tracks disbursement; terminal at Cair', () => {
  assert.equal(state(makeApp({ stage: 6 as Stage }), 'pencairan'), 'active')
  assert.equal(state(makeApp({ stage: 6 as Stage, disbursementStatus: 'Cair' }), 'pencairan'), 'done')
})
