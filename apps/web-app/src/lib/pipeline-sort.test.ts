import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LoanApplication } from './types'
import { comparePipelineRows, applicationSLAStatus } from './pipeline-sort'

// The comparator only reads stage / enteredStageAt / slaTargetDays / createdAt, so a partial
// fixture cast keeps the test hermetic (no full aggregate, no DB).
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

function app(id: string, enteredDaysAgo: number, createdAt: Date): LoanApplication {
  // Stage 1 target is 3 days → entered 5d ago = overdue, 2d = at_risk, 0d = normal.
  return { id, stage: 1, enteredStageAt: daysAgo(enteredDaysAgo), createdAt } as unknown as LoanApplication
}

test('comparePipelineRows — worst SLA first regardless of submission date', () => {
  const overdue = app('OVERDUE', 5, daysAgo(1)) // newest submission, but most urgent
  const atRisk = app('AT_RISK', 2, daysAgo(2))
  const normal = app('NORMAL', 0, daysAgo(3)) // oldest submission, but least urgent

  // sanity: the fixtures land in the intended SLA buckets
  assert.equal(applicationSLAStatus(overdue), 'overdue')
  assert.equal(applicationSLAStatus(atRisk), 'at_risk')
  assert.equal(applicationSLAStatus(normal), 'normal')

  const ordered = [normal, overdue, atRisk].sort(comparePipelineRows).map((a) => a.id)
  assert.deepEqual(ordered, ['OVERDUE', 'AT_RISK', 'NORMAL'])
})

test('comparePipelineRows — ties broken by oldest submission (FIFO)', () => {
  const older = app('OLDER', 5, new Date(2026, 0, 1))
  const newer = app('NEWER', 5, new Date(2026, 5, 1)) // same SLA bucket, submitted later

  const ordered = [newer, older].sort(comparePipelineRows).map((a) => a.id)
  assert.deepEqual(ordered, ['OLDER', 'NEWER'])
})
