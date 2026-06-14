import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { latestFillSyncedAt, listFills, listLostFills, updateFill } from './document-fill'
import { getDb } from '@/server/firebase/firestore'
import { subCol, SUB } from '@/server/firebase/collections'
import { documentFillId } from './doc-ids'
import { tsFromDate } from '@/server/firebase/timestamps'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for ApplicationDocumentFill under DATA_BACKEND=firestore. The repo has no
// create path (dormant), so fills are seeded directly; verifies latest-synced-at, per-doc listing,
// lost-in-doc listing, and composite-keyed updateFill. Parity target: document-fill.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

async function seedFill(
  appId: string,
  docId: string,
  tokenName: string,
  f: { value?: string | null; source?: string; status?: string; lastSyncedAt?: Date },
): Promise<void> {
  await subCol(getDb(), appId, SUB.documentFills).doc(documentFillId(docId, tokenName)).set({
    docId,
    tokenName,
    namedRangeId: null,
    value: f.value ?? null,
    source: f.source ?? 'system',
    status: f.status ?? 'filled',
    lastSyncedAt: tsFromDate(f.lastSyncedAt ?? new Date('2026-01-01T00:00:00Z')),
  })
}

test('latestFillSyncedAt returns the max lastSyncedAt for (app, docId)', async () => {
  await seedFill('APP-1', 'doc-1', 'nama_perusahaan', { lastSyncedAt: new Date('2026-01-01T00:00:00Z') })
  await seedFill('APP-1', 'doc-1', 'nama_grup_usaha', { lastSyncedAt: new Date('2026-03-01T00:00:00Z') })
  const t = await latestFillSyncedAt('APP-1', 'doc-1')
  assert.equal(t?.toISOString(), '2026-03-01T00:00:00.000Z')
  assert.equal(await latestFillSyncedAt('APP-1', 'no-doc'), null)
})

test('listFills returns only the requested doc fills', async () => {
  await seedFill('APP-1', 'doc-1', 'nama_perusahaan', { value: 'A' })
  await seedFill('APP-1', 'doc-2', 'akadx', { value: 'B' })
  const fills = await listFills('APP-1', 'doc-1')
  assert.equal(fills.length, 1)
  assert.equal(fills[0].tokenName, 'nama_perusahaan')
  assert.equal(fills[0].value, 'A')
})

test('listLostFills returns only lost-in-doc rows', async () => {
  await seedFill('APP-1', 'doc-1', 'nama_perusahaan', { status: 'lost-in-doc', value: 'gone' })
  await seedFill('APP-1', 'doc-1', 'nama_grup_usaha', { status: 'filled', value: 'ok' })
  const lost = await listLostFills('APP-1')
  assert.equal(lost.length, 1)
  assert.equal(lost[0].tokenName, 'nama_perusahaan')
  assert.equal(lost[0].value, 'gone')
})

test('updateFill addresses by (docId, tokenName) composite', async () => {
  await seedFill('APP-1', 'doc-1', 'nama_perusahaan', { status: 'filled', value: 'old' })
  await updateFill('APP-1', 'doc-1', 'nama_perusahaan', { value: 'new', source: 'analyst-app-edit', status: 'lost-in-doc', lastSyncedAt: new Date('2026-05-01T00:00:00Z') })
  const fills = await listFills('APP-1', 'doc-1')
  assert.equal(fills[0].value, 'new')
  assert.equal(fills[0].status, 'lost-in-doc')
  assert.equal(fills[0].source, 'analyst-app-edit')
  // updateFill on a missing row throws (parity with Prisma update).
  await assert.rejects(() => updateFill('APP-1', 'doc-1', 'missing_token', { status: 'filled' }))
})
