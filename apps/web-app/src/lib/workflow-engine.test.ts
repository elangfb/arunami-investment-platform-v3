import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertTransitionAllowed } from './workflow-engine'
import { AuthzError } from './auth/can'
import type { LoanApplication } from './types'
import type { TransitionConfig } from './stage-action'

// Only `stage` is read for the stage-number guards (the 1→2 intake checkpoint delegates to
// stage1To2Blockers, covered by its own tests), so a minimal stub suffices here.
const app = (stage: 1 | 2 | 3 | 4 | 5 | 6): LoanApplication => ({ stage }) as LoanApplication
const to = (targetStage: 1 | 2 | 3 | 4 | 5 | 6): TransitionConfig => ({ action: 'x', targetStage, requireReason: false })

test('assertTransitionAllowed — refuses manual 2→3 (dual handoff only)', () => {
  assert.throws(() => assertTransitionAllowed(app(2), to(3)), AuthzError)
})

test('assertTransitionAllowed — refuses manual 3→4 and 4→5 (signature-ladder only)', () => {
  assert.throws(() => assertTransitionAllowed(app(3), to(4)), AuthzError)
  assert.throws(() => assertTransitionAllowed(app(4), to(5)), AuthzError)
})

test('assertTransitionAllowed — allows send-backs and ungated advances', () => {
  assert.doesNotThrow(() => assertTransitionAllowed(app(3), to(1))) // send-back to intake
  assert.doesNotThrow(() => assertTransitionAllowed(app(4), to(1))) // risk reject → intake
  assert.doesNotThrow(() => assertTransitionAllowed(app(5), to(6))) // komite → pencairan
})
