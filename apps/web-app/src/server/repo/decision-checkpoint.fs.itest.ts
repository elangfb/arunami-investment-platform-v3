import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createDecisionCheckpoint, getLatestCheckpointPdfRefs } from './decision-checkpoint'
import { latestCheckpoint } from './serialize.firestore'
import { getDb } from '@/server/firebase/firestore'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for the DecisionCheckpoint WRITE under DATA_BACKEND=firestore. Verifies the
// create stores object-storage keys (NO inline PDF bytes), the audit PDF-refs read, and — critically —
// field-name alignment with the EXISTING P2 read (serialize.firestore.latestCheckpoint) so the frozen
// committee record surfaces in the application aggregate. Parity target: decision-checkpoint.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

const cp = (appId: string, decidedAt: Date, hash: string) => ({
  applicationId: appId,
  decision: 'approve',
  decidedAt,
  muapDocId: 'muap-1',
  rskDocId: 'rsk-1',
  muapStorageKey: `checkpoints/${appId}/muap.pdf`,
  rskStorageKey: `checkpoints/${appId}/rsk.pdf`,
  muapSizeBytes: 1234,
  rskSizeBytes: 5678,
  contentHash: hash,
  riskPolicyVersion: 3,
  riskDsrMaxPct: 40,
  riskLtvMaxPct: 80,
  riskKolMax: 2,
  exploredSources: [{ url: 'https://x' }],
})

test('create stores keys (no inline PDF bytes) and reads back via getLatestCheckpointPdfRefs', async () => {
  const { id } = await createDecisionCheckpoint(cp('APP-1', new Date('2026-01-01T00:00:00Z'), 'hash-1'))
  assert.ok(id)
  const refs = await getLatestCheckpointPdfRefs('APP-1')
  assert.equal(refs?.muapStorageKey, 'checkpoints/APP-1/muap.pdf')
  assert.equal(refs?.rskStorageKey, 'checkpoints/APP-1/rsk.pdf')
  assert.equal(refs?.muapPdf, null) // never stored inline in Firestore
  assert.equal(refs?.rskPdf, null)
})

test('field-name parity with the P2 aggregate read (latestCheckpoint)', async () => {
  await createDecisionCheckpoint(cp('APP-1', new Date('2026-02-02T00:00:00Z'), 'hash-xyz'))
  const ref = await latestCheckpoint(getDb(), 'APP-1')
  assert.ok(ref, 'latestCheckpoint must surface the written checkpoint')
  assert.equal(ref.contentHash, 'hash-xyz')
  assert.equal(ref.riskPolicyVersion, 3)
  assert.equal(ref.riskDsrMaxPct, 40)
})

test('getLatestCheckpointPdfRefs returns the most recent checkpoint', async () => {
  await createDecisionCheckpoint(cp('APP-1', new Date('2026-01-01T00:00:00Z'), 'old'))
  await createDecisionCheckpoint({ ...cp('APP-1', new Date('2026-06-01T00:00:00Z'), 'new'), muapStorageKey: 'checkpoints/APP-1/muap-new.pdf' })
  const refs = await getLatestCheckpointPdfRefs('APP-1')
  assert.equal(refs?.muapStorageKey, 'checkpoints/APP-1/muap-new.pdf')
})
