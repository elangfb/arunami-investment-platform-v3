import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { clearFirestore } from '@/server/repo/fs-test-helpers'
import { getApplication } from '@/server/repo/applications'
import { getMeeting, createMeeting } from '@/server/repo/meetings'
import { getUserAccessById } from '@/server/repo/users'
import { verifyQrToken } from '@/server/repo/approval'
import { APPLICATIONS } from '@/lib/seed-data/applications'
import { seedFirestoreFactory } from './seed-firestore'
import { seedFirestoreDemo } from './seed-firestore-demo'

// Firestore-emulator itest for the e2e DEMO seed (config/seed-firestore-demo.ts) — proves the demo
// data layer the Cucumber suite reads is reproduced faithfully on Firestore, through the REAL repo
// read paths. Run via scripts/test-integration-firestore.sh (DATA_BACKEND=firestore).
//
// beforeEach mirrors the per-scenario e2e reset: clear the emulator, then factory + demo({clean:false}).

beforeEach(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator')
  await clearFirestore()
  await seedFirestoreFactory()
  await seedFirestoreDemo({ clean: false })
})

// The applications the detail-action-band feature opens by id (must exist at their seeded stages).
const E2E_APPS = ['FOS-2026-001', 'FOS-2026-003', 'FOS-2026-007', 'FOS-2026-009', 'FOS-2026-014', 'FOS-2026-016']

test('seeds the detail-action-band apps at their seeded stages, readable via getApplication', async () => {
  const byId = new Map(APPLICATIONS.map((a) => [a.id, a]))
  for (const id of E2E_APPS) {
    const got = await getApplication(id)
    assert.ok(got, `app ${id} should be seeded`)
    assert.equal(got.stage, byId.get(id)?.stage, `app ${id} stage parity`)
    assert.equal(got.version, 0) // a freshly-created app
    assert.equal(typeof got.slaTargetDays, 'number') // enriched from versioned config (factory v1)
  }
})

test('FOS-2026-001 carries its intake owner (Siti Rahma, u-001) and she resolves with access', async () => {
  const app = await getApplication('FOS-2026-001')
  assert.ok(app?.assignments.some((a) => a.userId === 'u-001'), 'u-001 owns a FOS-2026-001 assignment')

  const siti = await getUserAccessById('u-001')
  assert.equal(siti?.email, 'siti.ao@example.com')
  assert.equal(siti?.name, 'Siti Rahma')
  assert.ok((siti?.roleNames.length ?? 0) >= 1, 'relationship-manager role resolves')
  assert.ok((siti?.desks.length ?? 0) >= 1, 'role grants effective desks')
})

test('seeds the maker-checker approver personas (TL / RTL) with their roles', async () => {
  const tl = await getUserAccessById('u-demo-tl')
  assert.equal(tl?.email, 'teguh.tl@example.com')
  assert.equal(tl?.roleNames.length, 1) // team-leader

  const rtl = await getUserAccessById('u-demo-rtl')
  assert.equal(rtl?.email, 'rini.rtl@example.com')
  assert.equal(rtl?.roleNames.length, 1) // risk-team-leader

  const superadmin = await getUserAccessById('u-demo-superadmin')
  assert.equal(superadmin?.isSuperadmin, true)
})

test('seeds committee meetings and advances the meeting-id counter past them (no collision)', async () => {
  const m = await getMeeting('MTG-2026-001')
  assert.ok(m, 'MTG-2026-001 seeded')
  assert.ok(m.agendaAppIds.includes('FOS-2026-009'))

  const counter = await getDb().collection(COL.counters).doc('meetingId-2026').get()
  assert.equal(counter.data()?.next, 3) // MTG-2026-001/002/003 seeded → counter at 3

  // The next createMeeting (e.g. a fixture meeting) must NOT re-collide with a seeded id. (createMeeting
  // allocates from counters/meetingId-<currentYear>; when the run year is 2026 the advance yields ...004.)
  const fresh = await createMeeting({
    date: '2026-07-01', time: '10:00', agendaAppIds: [], attendeeUserIds: [], chairUserId: 'u-004',
    status: 'upcoming', createdBy: 'fixture-system', createdAt: new Date('2026-07-01T03:00:00Z'),
  })
  assert.match(fresh.id, /^MTG-\d{4}-\d{3}$/)
  assert.ok(!['MTG-2026-001', 'MTG-2026-002', 'MTG-2026-003'].includes(fresh.id), 'no collision with a seeded meeting id')
})

test('seeds the two demo approval-routing rules', async () => {
  const snap = await getDb().collection(COL.config_approvalRouting).get()
  assert.equal(snap.size, 2)
})

test('a decided seed app exposes a verifiable MoM QR (chain=mom)', async () => {
  const decided = APPLICATIONS.find((a) => a.komiteDecision != null)
  assert.ok(decided, 'fixture set has at least one decided app')
  const v = await verifyQrToken(`qr-${decided.id}-mom-u-004`)
  assert.ok(v, 'MoM QR resolves')
  assert.equal(v.applicationId, decided.id)
})

test('seedFirestoreDemo is idempotent (clean re-run leaves apps readable)', async () => {
  await seedFirestoreDemo({ clean: true }) // scoped delete + re-write
  const app = await getApplication('FOS-2026-001')
  assert.ok(app, 'FOS-2026-001 still readable after a clean re-seed')
  assert.equal(app.version, 0)
})
