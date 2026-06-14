import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createExtractionRun, getLatestExtractionRun, getLatestOkExtractionRun } from './extraction-run'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for ExtractionRun under DATA_BACKEND=firestore. Verifies append-only run
// creates, latest-any, and latest-OK (skips ok=false / null-snapshot runs). Parity: extraction-run.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

const run = (appId: string, runId: string, ok: boolean, snapshot: string | null) => ({
  applicationId: appId,
  runId,
  extractedAt: new Date('2026-01-01T00:00:00Z'),
  ok,
  report: JSON.stringify({ runId, ok }),
  snapshot,
})

test('getLatestExtractionRun returns the most recent run (any ok)', async () => {
  await createExtractionRun(run('APP-1', 'r1', true, '{"s":1}'))
  await createExtractionRun(run('APP-1', 'r2', false, null))
  const latest = await getLatestExtractionRun('APP-1')
  assert.equal(latest?.runId, 'r2')
  assert.equal(latest?.ok, false)
})

test('getLatestOkExtractionRun skips ok=false and null-snapshot runs', async () => {
  await createExtractionRun(run('APP-1', 'r1', true, '{"s":1}')) // ok + snapshot ✓
  await createExtractionRun(run('APP-1', 'r2', true, null)) // ok but no snapshot ✗
  await createExtractionRun(run('APP-1', 'r3', false, '{"s":3}')) // snapshot but not ok ✗
  const ok = await getLatestOkExtractionRun('APP-1')
  assert.equal(ok?.runId, 'r1')
  assert.equal(ok?.snapshot, '{"s":1}')
})

test('returns null when no runs / no OK runs exist', async () => {
  assert.equal(await getLatestExtractionRun('NONE'), null)
  await createExtractionRun(run('APP-2', 'r1', false, null))
  assert.equal(await getLatestOkExtractionRun('APP-2'), null)
})
