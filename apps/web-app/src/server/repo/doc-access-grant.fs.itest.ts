import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getDocAccessGrant,
  upsertDocAccessGrant,
  listWriterGrantsForDoc,
  downgradeDocGrantToReader,
} from './doc-access-grant'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { docAccessGrantId } from './doc-ids'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for DocAccessGrant persistence under DATA_BACKEND=firestore. Verifies the
// dispatcher routes to doc-access-grant.firestore.ts: deterministic (docId,email) identity, upsert
// preserves grantedAt across updates, writer-only listing, and writer→reader downgrade. Parity target:
// doc-access-grant.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('upsert creates a grant; getDocAccessGrant reads it back', async () => {
  await upsertDocAccessGrant({ applicationId: 'APP-1', docId: 'doc-1', email: 'a@x.com', role: 'reader', permissionId: 'perm-1', grantedToUserId: 'u-1' })
  const g = await getDocAccessGrant('doc-1', 'a@x.com')
  assert.deepEqual(g, { role: 'reader', permissionId: 'perm-1' })
  assert.equal(await getDocAccessGrant('doc-1', 'nobody@x.com'), null)
})

test('upsert is keyed on (docId,email) and preserves grantedAt across updates', async () => {
  await upsertDocAccessGrant({ applicationId: 'APP-1', docId: 'doc-1', email: 'a@x.com', role: 'reader', permissionId: 'p1', grantedToUserId: 'u-1' })
  const ref = getDb().collection(COL.docAccessGrant).doc(docAccessGrantId('doc-1', 'a@x.com'))
  const firstGrantedAt = (await ref.get()).data()!.grantedAt
  await upsertDocAccessGrant({ applicationId: 'APP-1', docId: 'doc-1', email: 'a@x.com', role: 'writer', permissionId: 'p2', grantedToUserId: 'u-2' })
  // Single doc (same composite id), role upgraded, grantedAt unchanged.
  const all = await getDb().collection(COL.docAccessGrant).where('docId', '==', 'doc-1').get()
  assert.equal(all.size, 1)
  const d = (await ref.get()).data()!
  assert.equal(d.role, 'writer')
  assert.equal(d.permissionId, 'p2')
  assert.equal(d.grantedToUserId, 'u-2')
  assert.deepEqual(d.grantedAt, firstGrantedAt)
})

test('listWriterGrantsForDoc returns only writers for the doc', async () => {
  await upsertDocAccessGrant({ applicationId: 'APP-1', docId: 'doc-1', email: 'w@x.com', role: 'writer', permissionId: 'pw', grantedToUserId: 'u-w' })
  await upsertDocAccessGrant({ applicationId: 'APP-1', docId: 'doc-1', email: 'r@x.com', role: 'reader', permissionId: 'pr', grantedToUserId: 'u-r' })
  await upsertDocAccessGrant({ applicationId: 'APP-1', docId: 'doc-2', email: 'w2@x.com', role: 'writer', permissionId: 'pw2', grantedToUserId: 'u-w2' })
  const writers = await listWriterGrantsForDoc('doc-1')
  assert.equal(writers.length, 1)
  assert.deepEqual(writers[0], { email: 'w@x.com', permissionId: 'pw', grantedToUserId: 'u-w' })
})

test('downgradeDocGrantToReader lowers the role', async () => {
  await upsertDocAccessGrant({ applicationId: 'APP-1', docId: 'doc-1', email: 'w@x.com', role: 'writer', permissionId: 'pw', grantedToUserId: 'u-w' })
  await downgradeDocGrantToReader('doc-1', 'w@x.com')
  assert.equal((await getDocAccessGrant('doc-1', 'w@x.com'))?.role, 'reader')
  assert.equal((await listWriterGrantsForDoc('doc-1')).length, 0)
})
