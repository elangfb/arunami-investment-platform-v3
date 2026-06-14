import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { recordImpersonationStart, endImpersonationSessions } from './impersonation-audit'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for the impersonation-audit writer under DATA_BACKEND=firestore. Verifies
// the dispatcher routes to impersonation-audit.firestore.ts: append-only START rows (endedAt null),
// STOP stamps every OPEN row for that superadmin and leaves others untouched. Parity: impersonation-audit.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

const openRows = async (superadminId: string) =>
  (await getDb().collection(COL.impersonationAudit).where('superadminId', '==', superadminId).where('endedAt', '==', null).get()).size

test('recordImpersonationStart appends an open session row', async () => {
  await recordImpersonationStart({ superadminId: 's-1', actedAsDesk: 'RM', actedAsUserId: null, reason: 'cek' })
  const snap = await getDb().collection(COL.impersonationAudit).where('superadminId', '==', 's-1').get()
  assert.equal(snap.size, 1)
  const d = snap.docs[0].data()
  assert.equal(d.actedAsDesk, 'RM')
  assert.equal(d.actedAsUserId, null)
  assert.equal(d.reason, 'cek')
  assert.equal(d.endedAt, null)
  assert.ok(d.startedAt, 'startedAt server timestamp set')
})

test('endImpersonationSessions stamps every open row for the superadmin', async () => {
  await recordImpersonationStart({ superadminId: 's-2', actedAsDesk: 'RM', actedAsUserId: null, reason: null })
  await recordImpersonationStart({ superadminId: 's-2', actedAsDesk: null, actedAsUserId: 'u-9', reason: null })
  assert.equal(await openRows('s-2'), 2)
  await endImpersonationSessions('s-2')
  assert.equal(await openRows('s-2'), 0)
  // Both rows survive (append-only) — only endedAt was stamped.
  const all = await getDb().collection(COL.impersonationAudit).where('superadminId', '==', 's-2').get()
  assert.equal(all.size, 2)
  for (const doc of all.docs) assert.ok(doc.data().endedAt, 'endedAt stamped')
})

test('endImpersonationSessions leaves other superadmins untouched', async () => {
  await recordImpersonationStart({ superadminId: 's-3', actedAsDesk: 'RM', actedAsUserId: null, reason: null })
  await recordImpersonationStart({ superadminId: 's-4', actedAsDesk: 'RA', actedAsUserId: null, reason: null })
  await endImpersonationSessions('s-3')
  assert.equal(await openRows('s-3'), 0)
  assert.equal(await openRows('s-4'), 1)
})

test('endImpersonationSessions is a no-op when there is no open session', async () => {
  await endImpersonationSessions('s-nobody') // must not throw
  assert.equal(await openRows('s-nobody'), 0)
})
