import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getDriveRef,
  upsertDriveRef,
  findRootGrantByEmail,
  upsertRootGrant,
  countReaderGrants,
  listAllRootGrants,
  listReaderGrants,
  updateRootGrantPermissionId,
  markRootGrantInvalid,
  deleteRootGrant,
} from './drive-share'
import { listApplicationsWithMizanFolder } from './applications'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { driveRootGrantId } from './doc-ids'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for DriveRef + DriveRootGrant persistence (server/docs/root-share.ts) under
// DATA_BACKEND=firestore. Verifies first-writer-wins on the root ref, the email-keyed grant ledger
// (upsert preserves grantedAt, opaque-id update/delete), reader counting, and the reparent-sweep's
// applications `mizanDocFolderId != null` read. Parity target: drive-share.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('DriveRef is first-writer-wins (never repointed)', async () => {
  assert.equal(await getDriveRef('mizan-root'), null)
  await upsertDriveRef('mizan-root', 'folder-A')
  assert.deepEqual(await getDriveRef('mizan-root'), { folderId: 'folder-A' })
  await upsertDriveRef('mizan-root', 'folder-B') // must NOT repoint
  assert.deepEqual(await getDriveRef('mizan-root'), { folderId: 'folder-A' })
})

test('root grant: upsert by email, opaque id, grantedAt preserved across role change', async () => {
  assert.equal(await findRootGrantByEmail('a@x.com'), null)
  await upsertRootGrant({ userId: 'u-1', email: 'a@x.com', role: 'reader', permissionId: 'p1' })
  const row = await findRootGrantByEmail('a@x.com')
  assert.ok(row)
  assert.equal(row.id, driveRootGrantId('a@x.com'))
  assert.equal(row.role, 'reader')
  assert.equal(row.permissionId, 'p1')

  const ref = getDb().collection(COL.driveRootGrants).doc(driveRootGrantId('a@x.com'))
  const firstGrantedAt = (await ref.get()).data()!.grantedAt
  await upsertRootGrant({ userId: 'u-1', email: 'a@x.com', role: 'invalid', permissionId: null })
  const after = (await ref.get()).data()!
  assert.equal(after.role, 'invalid')
  assert.equal(after.permissionId, null)
  assert.deepEqual(after.grantedAt, firstGrantedAt, 'grantedAt unchanged across update')
  // Still a single doc.
  assert.equal((await getDb().collection(COL.driveRootGrants).get()).size, 1)
})

test('countReaderGrants / listReaderGrants count only readers', async () => {
  await upsertRootGrant({ userId: 'u-1', email: 'r1@x.com', role: 'reader', permissionId: 'p1' })
  await upsertRootGrant({ userId: 'u-2', email: 'r2@x.com', role: 'reader', permissionId: 'p2' })
  await upsertRootGrant({ userId: 'u-3', email: 'bad@x.com', role: 'invalid', permissionId: null })
  assert.equal(await countReaderGrants(), 2)
  assert.equal((await listReaderGrants()).length, 2)
  assert.equal((await listAllRootGrants()).length, 3)
})

test('updateRootGrantPermissionId / markRootGrantInvalid / deleteRootGrant by opaque id', async () => {
  await upsertRootGrant({ userId: 'u-1', email: 'a@x.com', role: 'reader', permissionId: 'p1' })
  const row = (await findRootGrantByEmail('a@x.com'))!
  await updateRootGrantPermissionId(row.id, 'p2')
  assert.equal((await findRootGrantByEmail('a@x.com'))!.permissionId, 'p2')
  await markRootGrantInvalid(row.id)
  const inv = (await findRootGrantByEmail('a@x.com'))!
  assert.equal(inv.role, 'invalid')
  assert.equal(inv.permissionId, null)
  await deleteRootGrant(row.id)
  assert.equal(await findRootGrantByEmail('a@x.com'), null)
})

test('listApplicationsWithMizanFolder returns only apps with a folder set (!= null)', async () => {
  const db = getDb()
  await db.collection(COL.applications).doc('APP-1').set({ mizanDocFolderId: 'fold-1', stage: 1 })
  await db.collection(COL.applications).doc('APP-2').set({ mizanDocFolderId: null, stage: 1 })
  await db.collection(COL.applications).doc('APP-3').set({ mizanDocFolderId: 'fold-3', stage: 1 })
  const apps = await listApplicationsWithMizanFolder()
  const byId = new Map(apps.map((a) => [a.id, a.mizanDocFolderId]))
  assert.equal(apps.length, 2)
  assert.equal(byId.get('APP-1'), 'fold-1')
  assert.equal(byId.get('APP-3'), 'fold-3')
  assert.equal(byId.has('APP-2'), false)
})
