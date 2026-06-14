import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getApplicationDriveFields, setMizanDocFolderId, setDriveFolderId } from './application-drive'
import { getDb } from '@/server/firebase/firestore'
import { appRef } from '@/server/firebase/collections'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for the targeted Application drive-field accessors under DATA_BACKEND=firestore.
// Verifies the projected read and the MERGE-only setters (touch only the named folder field, leave the
// rest of the aggregate intact). Parity target: application-drive.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

const seedApp = (id: string, fields: Record<string, unknown>) => appRef(getDb(), id).set(fields)

test('getApplicationDriveFields projects the side-channel fields', async () => {
  await seedApp('APP-1', { stage: 3, nasabahName: 'PT Maju', driveFolderId: 'user-fold', mizanDocFolderId: 'mizan-fold', exploredSources: [{ url: 'x' }], version: 5 })
  const f = await getApplicationDriveFields('APP-1')
  assert.equal(f?.stage, 3)
  assert.equal(f?.nasabahName, 'PT Maju')
  assert.equal(f?.driveFolderId, 'user-fold')
  assert.equal(f?.mizanDocFolderId, 'mizan-fold')
  assert.deepEqual(f?.exploredSources, [{ url: 'x' }])
  assert.equal(await getApplicationDriveFields('MISSING'), null)
})

test('setMizanDocFolderId / setDriveFolderId merge-update only their field', async () => {
  await seedApp('APP-1', { stage: 3, nasabahName: 'PT Maju', driveFolderId: null, mizanDocFolderId: null, version: 5 })
  await setMizanDocFolderId('APP-1', 'mizan-99')
  await setDriveFolderId('APP-1', 'user-99')
  const snap = await appRef(getDb(), 'APP-1').get()
  const d = snap.data()!
  assert.equal(d.mizanDocFolderId, 'mizan-99')
  assert.equal(d.driveFolderId, 'user-99')
  assert.equal(d.version, 5) // aggregate fields untouched (merge, not overwrite)
  assert.equal(d.nasabahName, 'PT Maju')
})
