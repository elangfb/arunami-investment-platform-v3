import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  createColek,
  listColeksForApp,
  activeColekForDesk,
  listPendingColeksForUser,
  activeDealCountsByDesk,
  completeColek,
  rejectColek,
  reassignColek,
} from './colek'
import { createApplicationForActor } from '../actions/application-create.core'
import { prisma } from '../db'
import type { Actor } from '@/lib/auth/can'

// Integration test (real Postgres, *_test DB only — see scripts/test-integration.sh).
// Proves the COLEK repo (RM-led redesign, design Follow-up-decisions "A1 colek"):
//  - create → listColeksForApp (newest-first) + activeColekForDesk (sticky lookup) → complete
//  - reassign appends to reassignmentLog and repoints the assignee, status stays pending
//  - activeDealCountsByDesk counts only NON-TERMINAL coleks (completed/rejected excluded)
//  - listPendingColeksForUser returns a user's open coleks; reject is terminal
//
// A colek has a real FK to Application (ON DELETE CASCADE), so the app scope must be a REAL row —
// we create one Application in `before` and clean coleks + the app in `after`.

const REQUESTED_BY = 'itest-colek-rm'
const UNIQUE_NIK = '3299990000000088' // unlikely to collide with other itests' dedup
const TARGET_DESK = 'legal'
let APP_ID: string

const rmActor: Actor = {
  userId: REQUESTED_BY,
  name: 'Colek RM',
  avatarInitials: 'CR',
  desks: ['intake'],
  isSuperadmin: false,
}

async function cleanColeks(): Promise<void> {
  await prisma.deskAssignment.deleteMany({ where: { requestedBy: REQUESTED_BY } })
}

before(async () => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
  const app = await createApplicationForActor(rmActor, {
    nasabahName: 'Colek Test',
    nasabahType: 'individual',
    phoneNumber: '081200000000',
    nik: UNIQUE_NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
  APP_ID = app.id
})

beforeEach(cleanColeks)
after(async () => {
  await cleanColeks()
  await prisma.application.deleteMany({ where: { createdBy: REQUESTED_BY } })
  await prisma.customer.deleteMany({ where: { createdBy: REQUESTED_BY } })
  await prisma.$disconnect()
})

function input(over: Partial<Parameters<typeof createColek>[0]> = {}) {
  return {
    applicationId: APP_ID,
    targetDesk: TARGET_DESK,
    assigneeUserId: 'u-legal-1',
    assigneeName: 'Legal Satu',
    requestedBy: REQUESTED_BY,
    requestedByName: 'Colek RM',
    description: 'Tolong kerjakan Analisa Yuridis',
    ...over,
  }
}

test('createColek → listColeksForApp (newest-first) + activeColekForDesk sticky lookup → completeColek', async () => {
  const first = await createColek(input({ description: 'colek pertama' }))
  assert.equal(first.status, 'pending')
  assert.equal(first.completedAt, null)

  const second = await createColek(input({ targetDesk: 'appraisal', description: 'colek kedua' }))

  const all = await listColeksForApp(APP_ID)
  assert.equal(all.length, 2)
  assert.equal(all[0].id, second.id, 'newest first')

  // Sticky lookup returns the open colek for the app×desk.
  const sticky = await activeColekForDesk(APP_ID, TARGET_DESK)
  assert.ok(sticky)
  assert.equal(sticky.id, first.id)

  // Once completed it is terminal → no longer the active colek for that desk.
  const done = await completeColek(first.id)
  assert.equal(done.status, 'completed')
  assert.ok(done.completedAt)
  assert.equal(await activeColekForDesk(APP_ID, TARGET_DESK), null)
})

test('reassignColek appends to reassignmentLog, repoints assignee, keeps status pending', async () => {
  const colek = await createColek(input({ assigneeUserId: 'u-legal-1', assigneeName: 'Legal Satu' }))

  const reassigned = await reassignColek(colek.id, { id: 'u-legal-2', name: 'Legal Dua' }, 'u-admin', 'beban kerja')
  assert.equal(reassigned.assigneeUserId, 'u-legal-2')
  assert.equal(reassigned.assigneeName, 'Legal Dua')
  assert.equal(reassigned.status, 'pending')
  assert.equal(reassigned.reassignmentLog?.length, 1)
  assert.equal(reassigned.reassignmentLog?.[0].from, 'u-legal-1')
  assert.equal(reassigned.reassignmentLog?.[0].to, 'u-legal-2')
  assert.equal(reassigned.reassignmentLog?.[0].by, 'u-admin')
  assert.equal(reassigned.reassignmentLog?.[0].reason, 'beban kerja')

  // A second reassign appends (does not overwrite) the log.
  const again = await reassignColek(colek.id, { id: 'u-legal-3', name: 'Legal Tiga' }, 'u-admin', 'cuti')
  assert.equal(again.reassignmentLog?.length, 2)
  assert.equal(again.reassignmentLog?.[1].from, 'u-legal-2')
  assert.equal(again.reassignmentLog?.[1].to, 'u-legal-3')
})

test('activeDealCountsByDesk counts only non-terminal coleks; listPendingColeksForUser + reject', async () => {
  // Two active coleks for u-legal-1, one for u-legal-2, plus one that we will terminate.
  await createColek(input({ assigneeUserId: 'u-legal-1' }))
  await createColek(input({ assigneeUserId: 'u-legal-1' }))
  await createColek(input({ assigneeUserId: 'u-legal-2' }))
  const toReject = await createColek(input({ assigneeUserId: 'u-legal-2' }))

  let counts = await activeDealCountsByDesk(TARGET_DESK)
  assert.equal(counts.get('u-legal-1')?.count, 2)
  assert.equal(counts.get('u-legal-2')?.count, 2)
  assert.ok(counts.get('u-legal-1')?.lastAssignedAt)

  // u-legal-2 has 2 open coleks now.
  const pending = await listPendingColeksForUser('u-legal-2')
  assert.equal(pending.length, 2)

  // Reject one of u-legal-2's coleks → terminal → excluded from the active caseload.
  const rejected = await rejectColek(toReject.id, 'bukan ranah saya')
  assert.equal(rejected.status, 'rejected')
  assert.ok(rejected.completedAt)

  counts = await activeDealCountsByDesk(TARGET_DESK)
  assert.equal(counts.get('u-legal-2')?.count, 1, 'terminal colek excluded')
  assert.equal((await listPendingColeksForUser('u-legal-2')).length, 1)
})
