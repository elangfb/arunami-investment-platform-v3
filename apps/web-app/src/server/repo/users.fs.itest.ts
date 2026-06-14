import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ensureUser, getUserByFirebaseUid, getUserAccessById, listUsers, listRoles, createRole, grantRole, grantDesk, revokeRole, revokeDesk, deleteRole } from './users'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for the identity/access repo (scripts/test-integration-firestore.sh).

const EMAIL = 'fsuser@example.com' // not in SUPERADMIN_EMAILS
before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('ensureUser — creates a zero-grant user; idempotent by uid', async () => {
  const u1 = await ensureUser({ email: EMAIL, firebaseUid: 'uid-1', name: 'FS User' })
  assert.equal(u1.email, EMAIL)
  assert.deepEqual(u1.desks, [])
  assert.equal(u1.isSuperadmin, false)
  const u2 = await ensureUser({ email: EMAIL, firebaseUid: 'uid-1', name: 'FS User' })
  assert.equal(u2.id, u1.id) // idempotent
})

test('ensureUser — adopts by email when the firebaseUid is new/stale (no duplicate row)', async () => {
  const orig = await ensureUser({ email: EMAIL, firebaseUid: 'uid-old', name: 'FS User' })
  const relinked = await ensureUser({ email: EMAIL, firebaseUid: 'uid-new', name: 'FS User' })
  assert.equal(relinked.id, orig.id, 're-link adopts the existing row, never creates a 2nd')
  assert.equal((await getUserByFirebaseUid('uid-new'))?.id, orig.id)
  const all = (await listUsers()).filter((u) => u.email === EMAIL)
  assert.equal(all.length, 1, 'exactly one row for the email (email-unique invariant)')
})

test('roles/desks — effective desks = role desks ∪ direct grants; deleteRole scrubs holders', async () => {
  const u = await ensureUser({ email: EMAIL, firebaseUid: 'uid-1', name: 'FS User' })
  await createRole('Relationship Manager', ['intake', 'slik'])
  const role = (await listRoles()).find((r) => r.name === 'Relationship Manager')!
  await grantRole(u.id, role.id, 'admin')
  await grantDesk(u.id, 'legal', 'admin')

  const access = await getUserAccessById(u.id)
  assert.ok(['intake', 'slik', 'legal'].every((d) => access!.desks.includes(d as never)), 'effective = role ∪ direct')
  assert.deepEqual(access?.roleNames, ['Relationship Manager'])

  await deleteRole(role.id)
  const after = await getUserAccessById(u.id)
  assert.ok(!after!.desks.includes('intake' as never), 'role desks gone after deleteRole')
  assert.ok(after!.desks.includes('legal' as never), 'direct grant remains')
})

test('createRole — duplicate name yields DISTINCT keys (uniqueness anchor, review fix)', async () => {
  await createRole('Duplicate Role', ['intake'])
  await createRole('Duplicate Role', ['legal'])
  const roles = (await listRoles()).filter((r) => r.name === 'Duplicate Role')
  assert.equal(roles.length, 2)
  assert.notEqual(roles[0].key, roles[1].key) // keys unique despite identical name (index_roleKey)
})

test('revokeRole/revokeDesk on a missing user is a silent no-op (parity with Prisma deleteMany)', async () => {
  await assert.doesNotReject(() => revokeRole('no-such-user', 'no-such-role'))
  await assert.doesNotReject(() => revokeDesk('no-such-user', 'legal'))
})

test('grant/revoke role is idempotent (arrayUnion/arrayRemove)', async () => {
  const u = await ensureUser({ email: EMAIL, firebaseUid: 'uid-1', name: 'FS User' })
  await createRole('Risk', ['rsk-author'])
  const role = (await listRoles()).find((r) => r.name === 'Risk')!
  await grantRole(u.id, role.id, 'admin')
  await grantRole(u.id, role.id, 'admin') // idempotent
  assert.equal((await listRoles()).find((r) => r.id === role.id)?.userCount, 1)
  await revokeRole(u.id, role.id)
  assert.equal((await getUserAccessById(u.id))?.roleNames.length, 0)
})
