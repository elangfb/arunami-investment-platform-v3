import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPersonalStatusMove } from './personal-status'
import type { LoanApplication, StageAssignment } from './types'

const asg = (over: Partial<StageAssignment>): StageAssignment => ({
  stage: 1, role: 'RM', userId: 'u1', userName: 'U', status: 'todo', assignedAt: new Date(), submittedAt: null, ...over,
})
const appWith = (assignments: StageAssignment[]) => ({ assignments }) as LoanApplication

test('applyPersonalStatusMove — sets the latest open assignment todo↔in_progress', () => {
  const app = appWith([asg({ status: 'todo' })])
  assert.deepEqual(applyPersonalStatusMove(app, 'u1', 'in_progress'), { ok: true })
  assert.equal(app.assignments[0].status, 'in_progress')
})

test('applyPersonalStatusMove — refuses a SUBMITTED assignment (workflow-owned column)', () => {
  const app = appWith([asg({ status: 'submitted', submittedAt: new Date() })])
  assert.deepEqual(applyPersonalStatusMove(app, 'u1', 'todo'), { ok: false, reason: 'submitted' })
  assert.equal(app.assignments[0].status, 'submitted') // unchanged
})

test('applyPersonalStatusMove — no assignment for the user → rejected', () => {
  const app = appWith([asg({ userId: 'someone-else' })])
  assert.deepEqual(applyPersonalStatusMove(app, 'u1', 'todo'), { ok: false, reason: 'no-assignment' })
})

test('applyPersonalStatusMove — targets the LATEST assignment when the user has several', () => {
  const app = appWith([asg({ stage: 1, status: 'submitted', submittedAt: new Date() }), asg({ stage: 2, status: 'todo' })])
  assert.deepEqual(applyPersonalStatusMove(app, 'u1', 'in_progress'), { ok: true })
  assert.equal(app.assignments[1].status, 'in_progress') // latest updated
  assert.equal(app.assignments[0].status, 'submitted') // earlier untouched
})
