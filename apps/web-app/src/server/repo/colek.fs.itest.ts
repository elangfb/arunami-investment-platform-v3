import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createColek,
  getColek,
  listColeksForApp,
  activeColekForDesk,
  listPendingColeksForUser,
  activeDealCountsByDesk,
  completeColek,
  rejectColek,
  reassignColek,
} from './colek'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for the COLEK repo (scripts/test-integration-firestore.sh).

const APP = 'FS-COLEK-APP-1'
const base = { applicationId: APP, targetDesk: 'legal', requestedBy: 'rm1', requestedByName: 'RM', description: 'cek yuridis' }

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('createColek → getColek round-trip; status pending, completedAt null', async () => {
  const c = await createColek({ ...base, assigneeUserId: 'lg1', assigneeName: 'Legal A' })
  assert.equal(c.status, 'pending')
  assert.equal(c.completedAt, null)
  assert.equal(c.assigneeName, 'Legal A')
  const got = await getColek(c.id)
  assert.equal(got?.id, c.id)
  assert.ok(got?.createdAt instanceof Date) // serverTimestamp resolved on read-back (critique #21)
})

test('activeColekForDesk — sticky open colek; null after completion', async () => {
  const c = await createColek({ ...base, assigneeUserId: 'lg1', assigneeName: 'Legal A' })
  const active = await activeColekForDesk(APP, 'legal')
  assert.equal(active?.id, c.id)
  await completeColek(c.id)
  assert.equal(await activeColekForDesk(APP, 'legal'), null) // terminal → not active
})

test('listColeksForApp — newest first', async () => {
  const a = await createColek({ ...base, assigneeUserId: 'lg1', assigneeName: 'A' })
  const b = await createColek({ ...base, targetDesk: 'appraisal', assigneeUserId: 'lg2', assigneeName: 'B' })
  const list = await listColeksForApp(APP)
  assert.deepEqual(list.map((c) => c.id), [b.id, a.id])
})

test('reassignColek — appends reassignmentLog, repoints assignee, keeps pending', async () => {
  const c = await createColek({ ...base, assigneeUserId: 'lg1', assigneeName: 'A' })
  const r = await reassignColek(c.id, { id: 'lg2', name: 'B' }, 'admin1', 'beban kerja')
  assert.equal(r.assigneeUserId, 'lg2')
  assert.equal(r.status, 'pending')
  assert.equal(r.reassignmentLog?.length, 1)
  assert.equal(r.reassignmentLog?.[0].from, 'lg1')
  assert.equal(r.reassignmentLog?.[0].to, 'lg2')
  assert.equal(typeof r.reassignmentLog?.[0].at, 'string') // ISO string, not Timestamp
})

test('activeDealCountsByDesk + listPendingColeksForUser — only non-terminal counted', async () => {
  await createColek({ ...base, assigneeUserId: 'lg1', assigneeName: 'A' })
  const c2 = await createColek({ ...base, applicationId: 'FS-COLEK-APP-2', assigneeUserId: 'lg1', assigneeName: 'A' })
  await rejectColek(c2.id, 'tidak relevan') // terminal → excluded
  const counts = await activeDealCountsByDesk('legal')
  assert.equal(counts.get('lg1')?.count, 1)
  const pending = await listPendingColeksForUser('lg1')
  assert.equal(pending.length, 1)
})
