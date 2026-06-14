import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplicationForActor } from './application-create.core'
import { startReviewForActor, startAdendumForActor } from './application-review.core'
import { getLineage, lineageHead } from '@/server/repo/applications'
import { rowToLoanApplication, APPLICATION_INCLUDE } from '@/server/repo/serialize'
import { muapToRiskBlockers } from '@/lib/stage-action'
import { AML_GATE_MESSAGE } from '@/lib/aml'
import { prisma } from '../db'
import type { Actor } from '@/lib/auth/can'

// Integration test (real Postgres, *_test DB only). P5 (RM-led redesign §7 / Topic 7): the review/adendum
// CHILD-create + lineage walk. Proves: startReview/startAdendum build a child that REUSES the parent's
// Customer, carries terms forward, sets originType + sourceApplicationId=parentId, and starts unattested
// (so muapToRiskBlockers requires a fresh AML attest — NO gate change); getLineage walks to the root in
// causal order; lineageHead resolves current terms; the lineage fields round-trip the persistence seam.

const CREATED_BY = 'itest-app-review'
const NIK = '3201017777770001'

const rmActor: Actor = {
  userId: CREATED_BY,
  name: 'RM Tester',
  avatarInitials: 'RT',
  desks: ['intake'],
  isSuperadmin: false,
}

async function clean(): Promise<void> {
  // Children reference parents via sourceApplicationId; delete apps then customers (created-by scoped).
  await prisma.application.deleteMany({ where: { createdBy: CREATED_BY } })
  await prisma.customer.deleteMany({ where: { createdBy: CREATED_BY } })
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(clean)
after(async () => {
  await clean()
  await prisma.$disconnect()
})

async function seedParent() {
  return createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    npwp: '012345678901234',
    alamat: 'Jl. Mawar No. 1',
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    incomeSource: 'karyawan',
    isMarried: true,
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
}

test('startReview — child reuses the parent Customer, carries terms forward, sets originType + sourceApplicationId, starts unattested', async () => {
  const parent = await seedParent()
  const parentRow = await prisma.application.findUnique({ where: { id: parent.id }, select: { customerId: true } })
  const parentCustomerId = parentRow!.customerId!

  const child = await startReviewForActor(rmActor, parent.id)

  // It is a fresh, normal Stage-1 app (reuses the full pipeline).
  assert.notEqual(child.id, parent.id)
  assert.equal(child.stage, 1)

  // Origin + lineage.
  assert.equal(child.originType, 'review')
  assert.equal(child.sourceApplicationId, parent.id)

  // Same Customer (link-direct, no fork).
  const childRow = await prisma.application.findUnique({ where: { id: child.id }, select: { customerId: true } })
  assert.equal(childRow!.customerId, parentCustomerId, 'review child reuses the SAME Customer')
  const custCount = await prisma.customer.count({ where: { createdBy: CREATED_BY, nik: NIK } })
  assert.equal(custCount, 1, 'no duplicate Customer')

  // Terms + identity carried forward.
  assert.equal(child.nasabahName, 'Budi Santoso')
  assert.equal(child.nik, NIK)
  assert.equal(child.akadType, 'Murabahah')
  assert.equal(child.requestedPlafond, 100_000_000)
  assert.equal(child.requestedTenorMonths, 12)
  assert.equal(child.purpose, 'modal kerja')

  // Starts UNATTESTED → fresh AML attest required (muapToRiskBlockers includes the AML message; NO gate change).
  assert.equal(child.amlAttestation, null)
  assert.ok(muapToRiskBlockers(child).includes(AML_GATE_MESSAGE), 'a review child must re-attest AML fresh')
})

test('startAdendum — same mechanics, distinguished by originType=adendum; optional reason audited', async () => {
  const parent = await seedParent()
  const child = await startAdendumForActor(rmActor, parent.id, 'Nasabah meminta perpanjangan tenor')

  assert.equal(child.originType, 'adendum')
  assert.equal(child.sourceApplicationId, parent.id)
  assert.equal(child.amlAttestation, null)

  // The off-cadence reason is recorded as a body-free audit entry on the NEW app.
  const reasoned = child.history.find((h) => h.reason === 'Nasabah meminta perpanjangan tenor')
  assert.ok(reasoned, 'the recorded reason is on the child app history')
  assert.match(reasoned!.action, /Adendum dimulai/)
})

test('getLineage — walks to the ROOT in causal order (root → … → this) with a cycle/depth guard', async () => {
  const root = await seedParent()
  const review = await startReviewForActor(rmActor, root.id)
  const adendum = await startAdendumForActor(rmActor, review.id)

  // From the head, the full story in causal order.
  const chain = await getLineage(adendum.id)
  assert.deepEqual(chain.map((a) => a.id), [root.id, review.id, adendum.id], 'causal order root-first')

  // The root returns a single-element chain (itself).
  const rootChain = await getLineage(root.id)
  assert.deepEqual(rootChain.map((a) => a.id), [root.id])

  // HEAD (current terms) resolves from any node in the chain (walks DOWN to the latest).
  assert.equal((await lineageHead(root.id))?.id, adendum.id, 'head from root = most recent')
  assert.equal((await lineageHead(review.id))?.id, adendum.id, 'head from middle = most recent')
  assert.equal((await lineageHead(adendum.id))?.id, adendum.id, 'head from head = itself')
})

test('round-trip — sourceApplicationId + disbursedAt persist; Customer.reviewCadenceMonths persists', async () => {
  const parent = await seedParent()
  const child = await startReviewForActor(rmActor, parent.id)

  // sourceApplicationId persisted on the row.
  const childRow = await prisma.application.findUnique({
    where: { id: child.id },
    select: { sourceApplicationId: true, originType: true, customerId: true },
  })
  assert.equal(childRow!.sourceApplicationId, parent.id)
  assert.equal(childRow!.originType, 'review')

  // disbursedAt round-trips (set it directly to prove the column reads back through the serializer).
  // Read via rowToLoanApplication (not the cache()-wrapped getApplication) so the post-update value is fresh.
  const cairAt = new Date('2026-06-01T00:00:00Z')
  await prisma.application.update({ where: { id: child.id }, data: { disbursedAt: cairAt } })
  const freshRow = await prisma.application.findUnique({ where: { id: child.id }, include: APPLICATION_INCLUDE })
  const reread = rowToLoanApplication(freshRow!)
  assert.equal(reread.disbursedAt?.getTime(), cairAt.getTime(), 'disbursedAt round-trips through serialize')
  assert.equal(reread.sourceApplicationId, parent.id, 'sourceApplicationId round-trips through serialize')

  // Customer.reviewCadenceMonths round-trips.
  await prisma.customer.update({ where: { id: childRow!.customerId! }, data: { reviewCadenceMonths: 6 } })
  const cust = await prisma.customer.findUnique({ where: { id: childRow!.customerId! }, select: { reviewCadenceMonths: true } })
  assert.equal(cust!.reviewCadenceMonths, 6)
})
