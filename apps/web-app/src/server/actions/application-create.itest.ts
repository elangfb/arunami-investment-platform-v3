import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplicationForActor } from './application-create.core'
import {
  getCustomer,
  getCustomerWithApplications,
  findCustomerDedupMatches,
} from '@/server/repo/customer'
import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { prisma } from '../db'
import type { Actor } from '@/lib/auth/can'

// Integration test (real Postgres, *_test DB only — see scripts/test-integration.sh).
// STEP B (ADR-0020 §2): dual-write on create + customer-first dedup link.
// Proves: createApplicationForActor creates an Application AND a linked Customer (parity);
// a second create with the SAME identity REUSES the existing Customer (no duplicate);
// and saveApplication mirrors identity edits onto the linked Customer (dual-write on update).

const CREATED_BY = 'itest-app-create'
const NIK = '3201018888880001'
const BIZ_NPWP = '091222333444555'
const BIZ_NIB = '8887776665554'

const rmActor: Actor = {
  userId: CREATED_BY,
  name: 'RM Tester',
  avatarInitials: 'RT',
  desks: ['intake'],
  isSuperadmin: false,
}

async function clean(): Promise<void> {
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

test('createApplicationForActor (individual) — creates a linked Customer carrying matching identity (parity)', async () => {
  const app = await createApplicationForActor(rmActor, {
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

  // The new Application is linked to a Customer.
  const row = await prisma.application.findUnique({ where: { id: app.id }, select: { customerId: true } })
  assert.ok(row?.customerId, 'Application.customerId must be set on create')

  // The Customer carries identity matching the input (parity with the dual-read source).
  const cust = await getCustomer(row.customerId!)
  assert.ok(cust)
  assert.equal(cust.type, 'individual')
  assert.equal(cust.nik, NIK)
  assert.equal(cust.nama, 'Budi Santoso')
  assert.equal(cust.npwp, '012345678901234')
  assert.equal(cust.alamat, 'Jl. Mawar No. 1')
  assert.equal(cust.isMarried, true)
  assert.equal(cust.incomeSource, 'karyawan')
  assert.equal(cust.phoneNumber, '081234567890')
})

test('createApplicationForActor — a second create with the SAME NIK links the existing Customer (no duplicate)', async () => {
  const first = await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
  const second = await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 250_000_000,
    requestedTenorMonths: 24,
    purpose: 'ekspansi usaha',
  })

  const rowA = await prisma.application.findUnique({ where: { id: first.id }, select: { customerId: true } })
  const rowB = await prisma.application.findUnique({ where: { id: second.id }, select: { customerId: true } })
  assert.ok(rowA?.customerId && rowB?.customerId)
  assert.equal(rowB.customerId, rowA.customerId, 'repeat NIK reuses the same Customer')

  const count = await prisma.customer.count({ where: { createdBy: CREATED_BY, nik: NIK } })
  assert.equal(count, 1, 'no duplicate Customer for a repeat identity')
})

test('createApplicationForActor (business) — links/reuses by NPWP', async () => {
  const first = await createApplicationForActor(rmActor, {
    nasabahName: 'PT Maju Jaya',
    nasabahType: 'business',
    namaUsaha: 'PT Maju Jaya',
    phoneNumber: '0217654321',
    npwp: BIZ_NPWP,
    nib: BIZ_NIB,
    bidangUsaha: 'perdagangan',
    akadType: 'Musyarakah',
    collateralType: 'fixed_asset',
    requestedPlafond: 500_000_000,
    requestedTenorMonths: 36,
    purpose: 'modal kerja',
  })
  const second = await createApplicationForActor(rmActor, {
    nasabahName: 'PT Maju Jaya',
    nasabahType: 'business',
    namaUsaha: 'PT Maju Jaya',
    phoneNumber: '0217654321',
    npwp: BIZ_NPWP,
    akadType: 'Musyarakah',
    collateralType: 'fixed_asset',
    requestedPlafond: 600_000_000,
    requestedTenorMonths: 36,
    purpose: 'ekspansi',
  })

  const rowA = await prisma.application.findUnique({ where: { id: first.id }, select: { customerId: true } })
  const rowB = await prisma.application.findUnique({ where: { id: second.id }, select: { customerId: true } })
  assert.equal(rowB?.customerId, rowA?.customerId, 'repeat NPWP reuses the same Customer')

  const cust = await getCustomer(rowA!.customerId!)
  assert.equal(cust?.namaUsaha, 'PT Maju Jaya')
  assert.equal(cust?.npwp, BIZ_NPWP)
  assert.equal(cust?.nib, BIZ_NIB)
  assert.equal(cust?.bidangUsaha, 'perdagangan')
})

test('saveApplication — mirrors identity edits onto the linked Customer (dual-write on update)', async () => {
  const app = await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
  const row = await prisma.application.findUnique({ where: { id: app.id }, select: { customerId: true } })
  assert.ok(row?.customerId)

  // Simulate an OCR-confirm filling NPWP/alamat (confirmExtractedFieldAction → saveApplication).
  const loaded = await loadApplicationForWrite(app.id)
  assert.ok(loaded)
  loaded.npwp = '999888777666555'
  loaded.alamat = 'Jl. Melati No. 9'
  await saveApplication(loaded)

  const cust = await getCustomer(row.customerId!)
  assert.equal(cust?.npwp, '999888777666555', 'NPWP edit mirrors onto the linked Customer')
  assert.equal(cust?.alamat, 'Jl. Melati No. 9', 'alamat edit mirrors onto the linked Customer')
  assert.equal(cust?.nik, NIK, 'unchanged identity preserved')
})

// Regression (adversarial finding, P1 verify): a Customer is SHARED 1:many across a customer's
// apps. saveApplication's identity mirror must MERGE, never clobber — a sibling app saving with a
// blank field must NOT null identity another app populated on the shared Customer.
test('mirror MERGES — a sibling blank save does not null shared-Customer identity', async () => {
  const SHARE_NPWP = '091000000000001'
  const a = await createApplicationForActor(rmActor, {
    nasabahName: 'PT Berbagi', nasabahType: 'business', namaUsaha: 'PT Berbagi',
    phoneNumber: '0210000000', npwp: SHARE_NPWP, nib: 'NIB-SHARE-1', bidangUsaha: 'jasa',
    akadType: 'Musyarakah', collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000, requestedTenorMonths: 12, purpose: 'modal kerja',
  })
  const b = await createApplicationForActor(rmActor, {
    nasabahName: 'PT Berbagi', nasabahType: 'business', namaUsaha: 'PT Berbagi',
    phoneNumber: '0210000000', npwp: SHARE_NPWP, // nib + bidangUsaha intentionally BLANK
    akadType: 'Musyarakah', collateralType: 'fixed_asset',
    requestedPlafond: 200_000_000, requestedTenorMonths: 24, purpose: 'ekspansi',
  })
  const rowA = await prisma.application.findUnique({ where: { id: a.id }, select: { customerId: true } })
  const rowB = await prisma.application.findUnique({ where: { id: b.id }, select: { customerId: true } })
  assert.equal(rowB?.customerId, rowA?.customerId, 'same NPWP shares one Customer')
  const sharedId = rowA!.customerId!
  assert.equal((await getCustomer(sharedId))?.nib, 'NIB-SHARE-1', 'shared Customer carries A nib pre-save')

  // Save app B (blank nib/bidangUsaha). Pre-fix this nulled the shared Customer's nib (data loss).
  const freshB = await loadApplicationForWrite(b.id)
  await saveApplication(freshB!)

  const after = await getCustomer(sharedId)
  assert.equal(after?.nib, 'NIB-SHARE-1', 'sibling blank save must NOT clobber shared Customer nib')
  assert.equal(after?.bidangUsaha, 'jasa', 'sibling blank save must NOT clobber shared bidangUsaha')
})

// P1 (ADR-0020 §2): link-direct path (limitation #2). "Buat Pengajuan" from a Nasabah file passes
// the exact customerId so the new Application links THAT customer — even when the intake identity key
// is blank or DIFFERENT — and must NOT dedup-fork a new Customer.
test('createApplicationForActor — explicit customerId links THAT customer directly (blank/different NIK, no new Customer)', async () => {
  // Seed a customer via a first create (carries NIK).
  const seed = await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
  const seedRow = await prisma.application.findUnique({ where: { id: seed.id }, select: { customerId: true } })
  const targetCustomerId = seedRow!.customerId!
  const beforeCount = await prisma.customer.count({ where: { createdBy: CREATED_BY } })

  // New application with a BLANK NIK but an explicit customerId → must link the target directly.
  const linked = await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    // nik intentionally BLANK — without link-direct this would fork a fresh Customer.
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 250_000_000,
    requestedTenorMonths: 24,
    purpose: 'ekspansi usaha',
    customerId: targetCustomerId,
  })

  const linkedRow = await prisma.application.findUnique({ where: { id: linked.id }, select: { customerId: true } })
  assert.equal(linkedRow?.customerId, targetCustomerId, 'explicit customerId links THAT customer directly')

  const afterCount = await prisma.customer.count({ where: { createdBy: CREATED_BY } })
  assert.equal(afterCount, beforeCount, 'link-direct must NOT create a new Customer')
})

// P1 (ADR-0020 §2): enriched dedup wrapper for the create-time nudge.
test('findCustomerDedupMatches — returns enriched match (label + applicationCount) for a repeat identity, [] for unknown', async () => {
  // Two applications on the same NIK → one shared Customer with applicationCount 2.
  await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
  await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 250_000_000,
    requestedTenorMonths: 24,
    purpose: 'ekspansi',
  })

  const matches = await findCustomerDedupMatches({ type: 'individual', nik: NIK })
  assert.equal(matches.length, 1, 'one enriched match for the repeat identity')
  assert.equal(matches[0].label, 'Budi Santoso', 'label = nama for an individual')
  assert.equal(matches[0].applicationCount, 2, 'applicationCount reflects both linked apps')

  const none = await findCustomerDedupMatches({ type: 'individual', nik: '3299999999999999' })
  assert.deepEqual(none, [], 'unknown identity returns []')
})

// P1 (ADR-0020 §2): the Nasabah file view loads the customer + its applications (count parity).
test('getCustomerWithApplications — returns the customer + its applications (count parity)', async () => {
  const first = await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
  await createApplicationForActor(rmActor, {
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    phoneNumber: '081234567890',
    nik: NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 250_000_000,
    requestedTenorMonths: 24,
    purpose: 'ekspansi',
  })
  const firstRow = await prisma.application.findUnique({ where: { id: first.id }, select: { customerId: true } })
  const customerId = firstRow!.customerId!

  const result = await getCustomerWithApplications(customerId)
  assert.ok(result, 'customer file loads')
  assert.equal(result.customer.id, customerId)
  assert.equal(result.customer.nik, NIK)
  assert.equal(result.applications.length, 2, 'both linked applications returned (count parity)')
  // Newest-first ordering: ids carry the most-recent createdAt first.
  assert.ok(result.applications.every((a) => a.id.startsWith('FOS-')), 'applications go through the domain serializer')

  assert.equal(await getCustomerWithApplications('cust-does-not-exist'), null, 'unknown id returns null')
})
