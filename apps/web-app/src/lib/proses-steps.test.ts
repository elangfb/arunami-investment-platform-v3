import test from 'node:test'
import assert from 'node:assert/strict'
import { computeStepStatuses, PROSES_STEPS } from './proses-steps'
import type { LoanApplication } from './types'

const LEGAL = PROSES_STEPS.findIndex((s) => s.label === 'Legal, Agunan & Biro')

// Minimal app shaped for the step done-predicates; defaults = nothing done yet.
function app(over: Record<string, unknown> = {}): LoanApplication {
  return {
    stage: 1,
    documents: [],
    analysis: { character: '', capacity: '', capital: '', condition: '', collateral: '', syariah: '', generated: false },
    financialsAssessed: false,
    muapSyncedAt: null,
    riskRecommendation: null,
    komiteDecision: null,
    disbursementStatus: null,
    stage2LegalApproval: null,
    stage2SlikApproval: null,
    kolEntered: false,
    appraisalPath: null,
    ...over,
  } as unknown as LoanApplication
}

const bureauReady = { stage2SlikApproval: { verifiedByRT: true }, kolEntered: true }
const legalDone = { stage2LegalApproval: { verifiedByLG: true }, appraisalPath: 'internal' }

test('proses: Legal step LAGS as active (not done) at Stage 3 while Analisa Yuridis pending', () => {
  // RM advanced 2→3 on bureau data alone (ADR-0007); Legal/Appraisal not yet complete.
  // Regression guard: before the lag fix the app.stage>2 shortcut marked this 'done'.
  assert.equal(computeStepStatuses(app({ stage: 3, ...bureauReady }))[LEGAL], 'active')
})

test('proses: Legal step stays active even when a later artifact (MUAP) already exists', () => {
  // The MUAP can be drafted before Legal finishes — the later-artifact shortcut must NOT
  // mark a lag-aware step done.
  const a = app({ stage: 3, ...bureauReady, muapSyncedAt: new Date().toISOString() })
  assert.equal(computeStepStatuses(a)[LEGAL], 'active')
})

test('proses: Legal step is done once Analisa Yuridis + Penilaian + bureau are complete', () => {
  assert.equal(computeStepStatuses(app({ stage: 3, ...bureauReady, ...legalDone }))[LEGAL], 'done')
})

test('proses: Legal step reads done at Stage 4 (guaranteed complete by the MUAP→Risk gate)', () => {
  assert.equal(computeStepStatuses(app({ stage: 4, ...bureauReady, ...legalDone }))[LEGAL], 'done')
})
