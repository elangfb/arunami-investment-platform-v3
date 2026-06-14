import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { ensureUser, getUserByFirebaseUid } from './users'
import { prisma } from '../db'

// Integration test (real Postgres, *_test DB only). Covers first-login provisioning,
// and specifically the stale-firebaseUid re-link: when an existing user's uid no longer
// resolves (e.g. the Auth Emulator regenerated its localId) a fresh login must ADOPT the
// row by email rather than attempt a duplicate create that fails the email unique
// constraint → 401. Regression guard for the "several accounts cannot login in emu" bug.

const EMAIL = 'itest-relink@example.test' // NOT in SUPERADMIN_EMAILS → allowlisted=false
const OLD_UID = 'itest-uid-old'
const NEW_UID = 'itest-uid-new'

async function clean(): Promise<void> {
  await prisma.user.deleteMany({
    where: { OR: [{ email: EMAIL }, { firebaseUid: { in: [OLD_UID, NEW_UID] } }] },
  })
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(clean)
after(async () => {
  await clean()
  await prisma.$disconnect()
})

test('ensureUser — re-links a STALE firebaseUid instead of crashing on duplicate email', async () => {
  // A previously-linked user whose emulator localId has since changed.
  await prisma.user.create({
    data: { id: 'itest-relink', email: EMAIL, firebaseUid: OLD_UID, name: 'Relink Tester', avatarInitials: 'RT' },
  })

  const out = await ensureUser({ email: EMAIL, firebaseUid: NEW_UID, name: 'Relink Tester' })

  assert.equal(out.id, 'itest-relink', 'adopts the existing row, not a new one')
  // Row now resolves by the NEW uid; the stale uid is gone.
  assert.ok(await getUserByFirebaseUid(NEW_UID), 'new uid resolves')
  assert.equal(await getUserByFirebaseUid(OLD_UID), null, 'old uid no longer resolves')
  // No duplicate row was created (the bug created a second row → unique violation).
  assert.equal(await prisma.user.count({ where: { email: EMAIL } }), 1, 'exactly one row for the email')
})

test('ensureUser — links a seeded user that has no firebaseUid yet', async () => {
  await prisma.user.create({
    data: { id: 'itest-relink', email: EMAIL, firebaseUid: null, name: 'Seeded', avatarInitials: 'SD' },
  })

  const out = await ensureUser({ email: EMAIL, firebaseUid: NEW_UID })

  assert.equal(out.id, 'itest-relink')
  assert.ok(await getUserByFirebaseUid(NEW_UID))
})

test('ensureUser — creates a brand-new zero-grant user for an unknown email', async () => {
  const out = await ensureUser({ email: EMAIL, firebaseUid: NEW_UID, name: 'Newcomer' })

  assert.equal(out.email, EMAIL)
  assert.equal(out.isSuperadmin, false)
  assert.deepEqual(out.desks, [], 'no grants → awaiting access')
  assert.equal(await prisma.user.count({ where: { email: EMAIL } }), 1)
})

test('ensureUser — re-link is idempotent: a second login with the now-current uid is a no-op match', async () => {
  await prisma.user.create({
    data: { id: 'itest-relink', email: EMAIL, firebaseUid: OLD_UID, name: 'Relink Tester', avatarInitials: 'RT' },
  })
  await ensureUser({ email: EMAIL, firebaseUid: NEW_UID })

  const again = await ensureUser({ email: EMAIL, firebaseUid: NEW_UID })

  assert.equal(again.id, 'itest-relink')
  assert.equal(await prisma.user.count({ where: { email: EMAIL } }), 1)
})

test('ensureUser — re-link preserves superadmin and honours the allowlist', async () => {
  await prisma.user.create({
    data: { id: 'itest-relink', email: EMAIL, firebaseUid: OLD_UID, name: 'Super', avatarInitials: 'SU', isSuperadmin: true },
  })

  const out = await ensureUser({ email: EMAIL, firebaseUid: NEW_UID })

  assert.equal(out.isSuperadmin, true, 'never auto-demoted on re-link')
})
