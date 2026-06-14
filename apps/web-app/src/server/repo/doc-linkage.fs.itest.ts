import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getDocLinkage, getDocLinkageOrThrow, upsertDocLinkage, updateDocLinkage } from './doc-linkage'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for DocLinkage under DATA_BACKEND=firestore. Verifies upsert create-vs-update
// semantics (update applies only its partial; createdAt preserved), getOrThrow's NotFound, and partial
// updateDocLinkage (shortcut warning / momDocId). Parity target: doc-linkage.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('upsert create then read; defaults momDocId/sp3DocId/shortcutWarning to null', async () => {
  assert.equal(await getDocLinkage('APP-1'), null)
  await upsertDocLinkage({ applicationId: 'APP-1', create: { muapDocId: 'muap-1', rskDocId: null, templateVersion: 'v1' }, update: {} })
  const row = await getDocLinkage('APP-1')
  assert.ok(row)
  assert.equal(row.muapDocId, 'muap-1')
  assert.equal(row.rskDocId, null)
  assert.equal(row.momDocId, null)
  assert.equal(row.sp3DocId, null)
  assert.equal(row.shortcutWarning, null)
  assert.equal(row.templateVersion, 'v1')
})

test('upsert update path applies only its partial and preserves createdAt', async () => {
  await upsertDocLinkage({ applicationId: 'APP-1', create: { muapDocId: 'muap-1', rskDocId: null, templateVersion: 'v1' }, update: {} })
  const created = await getDocLinkage('APP-1')
  await upsertDocLinkage({ applicationId: 'APP-1', create: { muapDocId: 'X', rskDocId: 'Y', templateVersion: 'v9' }, update: { muapDocId: 'muap-2' } })
  const row = await getDocLinkage('APP-1')
  assert.ok(row && created)
  assert.equal(row.muapDocId, 'muap-2') // update applied
  assert.equal(row.rskDocId, null) // NOT touched by the update partial
  assert.equal(row.templateVersion, 'v1') // NOT touched
  assert.deepEqual(row.createdAt, created.createdAt) // createdAt preserved across update
})

test('getDocLinkageOrThrow throws when absent', async () => {
  await assert.rejects(() => getDocLinkageOrThrow('NOPE'))
})

test('updateDocLinkage sets a partial; throws on a missing row', async () => {
  await upsertDocLinkage({ applicationId: 'APP-1', create: { muapDocId: 'muap-1', rskDocId: null, templateVersion: 'v1' }, update: {} })
  await updateDocLinkage('APP-1', { shortcutWarning: 'beri akses', momDocId: 'mom-1' })
  const row = await getDocLinkage('APP-1')
  assert.equal(row?.shortcutWarning, 'beri akses')
  assert.equal(row?.momDocId, 'mom-1')
  await assert.rejects(() => updateDocLinkage('MISSING', { shortcutWarning: null }))
})
