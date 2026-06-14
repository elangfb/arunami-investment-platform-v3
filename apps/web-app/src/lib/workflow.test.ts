import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveWorkflowSnapshot, isAt, isAtOrAfter, isBefore, isPreKomite, stepOf, stageOfStep } from './workflow'
import type { LoanApplication } from './types'

const appStub = (over: Partial<LoanApplication>): LoanApplication => ({ stage: 1, ...over }) as LoanApplication

test('stepOf / stageOfStep — named steps map 1:1 to the current engine stages', () => {
  assert.equal(stepOf({ stage: 1 }), 'intake')
  assert.equal(stepOf({ stage: 4 }), 'risk')
  assert.equal(stepOf({ stage: 6 }), 'pencairan')
  assert.equal(stageOfStep('feasibility'), 3)
  assert.equal(stageOfStep('komite'), 5)
})

test('isAt / isAtOrAfter / isBefore — semantic stage predicates', () => {
  assert.equal(isAt({ stage: 3 }, 'feasibility'), true)
  assert.equal(isAt({ stage: 3 }, 'risk'), false)
  assert.equal(isAtOrAfter({ stage: 4 }, 'risk'), true)
  assert.equal(isAtOrAfter({ stage: 3 }, 'risk'), false)
  assert.equal(isBefore({ stage: 3 }, 'risk'), true)
  assert.equal(isBefore({ stage: 4 }, 'risk'), false)
})

test('isPreKomite — true through Origination + Risk, false from Komite on (proposal-freeze boundary)', () => {
  assert.equal(isPreKomite({ stage: 1 }), true)
  assert.equal(isPreKomite({ stage: 4 }), true)
  assert.equal(isPreKomite({ stage: 5 }), false)
  assert.equal(isPreKomite({ stage: 6 }), false)
})

test('deriveWorkflowSnapshot — projects phase/step/status from the engine state', () => {
  const s = deriveWorkflowSnapshot(appStub({ stage: 4 }))
  assert.equal(s.phase, 2)
  assert.equal(s.step, 'risk')
  assert.equal(s.status, 'active')
  assert.equal(s.closeReason, null)
})

test('deriveWorkflowSnapshot — closed app carries closed status (closeReason defaults null)', () => {
  const s = deriveWorkflowSnapshot(appStub({ stage: 6, applicationStatus: 'closed' }))
  assert.equal(s.status, 'closed')
  assert.equal(s.closeReason, null)
})
