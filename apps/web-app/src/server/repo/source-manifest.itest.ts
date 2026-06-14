import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { appendScanEntries, listManifest, latestPerDocType } from './source-manifest'
import { createApplicationForActor } from '../actions/application-create.core'
import { prisma } from '../db'
import type { Actor } from '@/lib/auth/can'

// Integration test (real Postgres, *_test DB only — see scripts/test-integration.sh).
// Proves the source-doc manifest ledger (P2 / design §3 "Versioning (source docs)" / Fork B5):
//  - append → listManifest returns the scanned refs (oldest-first)
//  - re-appending the SAME (docType, sha256) is deduped (no dup row; deduped++)
//  - a CHANGED sha256 for the same docType adds a NEW version row; latestPerDocType returns the newest
//  - app-scope and customer-scope rows do not bleed across scopes
//
// A manifest entry has a real FK to Application / Customer (ON DELETE CASCADE), so the scopes must be
// REAL rows — we create one Application (+ a standalone Customer) in `before` and clean them in `after`.

const SCANNED_BY = 'itest-source-manifest'
const UNIQUE_NIK = '3299990000000077' // unlikely to collide with other itests' dedup
let APP_ID: string
let CUST_ID: string

const rmActor: Actor = {
  userId: SCANNED_BY,
  name: 'SM RM',
  avatarInitials: 'SM',
  desks: ['intake'],
  isSuperadmin: false,
}

async function clean(): Promise<void> {
  await prisma.sourceDocManifestEntry.deleteMany({ where: { scannedBy: SCANNED_BY } })
}

before(async () => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
  // Real Application scope (createApplicationForActor builds a full valid Stage-1 aggregate + links a Customer).
  const app = await createApplicationForActor(rmActor, {
    nasabahName: 'SM Test',
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
  // Independent standalone Customer scope.
  const cust = await prisma.customer.create({ data: { type: 'individual', nama: 'SM Cust', createdBy: SCANNED_BY } })
  CUST_ID = cust.id
})

beforeEach(clean)
after(async () => {
  await clean()
  await prisma.application.deleteMany({ where: { createdBy: SCANNED_BY } })
  await prisma.customer.deleteMany({ where: { createdBy: SCANNED_BY } })
  await prisma.$disconnect()
})

test('appendScanEntries → listManifest returns the scanned refs (oldest-first)', async () => {
  const res = await appendScanEntries({ applicationId: APP_ID }, SCANNED_BY, [
    { docType: 'ktp', fullPath: 'Pengajuan/KTP & NPWP Pengurus.pdf', sha256: 'aaa', fileId: 'drive-ktp-1' },
    { docType: 'npwp', fullPath: 'Pengajuan/KTP & NPWP Pengurus.pdf', sha256: 'bbb' },
  ])
  assert.equal(res.added, 2)
  assert.equal(res.deduped, 0)

  const rows = await listManifest({ applicationId: APP_ID })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].applicationId, APP_ID)
  assert.equal(rows[0].customerId, null)
  const ktp = rows.find((r) => r.docType === 'ktp')
  assert.ok(ktp)
  assert.equal(ktp.sha256, 'aaa')
  assert.equal(ktp.fileId, 'drive-ktp-1')
})

test('re-appending the SAME (docType, sha256) is deduped — no duplicate row', async () => {
  const first = await appendScanEntries({ applicationId: APP_ID }, SCANNED_BY, [
    { docType: 'npwp', fullPath: 'Nasabah/NPWP.pdf', sha256: 'sha-npwp' },
  ])
  assert.equal(first.added, 1)

  const second = await appendScanEntries({ applicationId: APP_ID }, SCANNED_BY, [
    { docType: 'npwp', fullPath: 'Nasabah/NPWP.pdf', sha256: 'sha-npwp' }, // unchanged bytes → no new version
    { docType: 'nib', fullPath: 'Nasabah/NIB.pdf', sha256: 'sha-nib' }, // new doc → added
  ])
  assert.equal(second.added, 1)
  assert.equal(second.deduped, 1)

  const rows = await listManifest({ applicationId: APP_ID })
  assert.equal(rows.length, 2)
  assert.equal(rows.filter((r) => r.docType === 'npwp').length, 1)
})

test('duplicate inputs WITHIN one call dedupe against each other', async () => {
  const res = await appendScanEntries({ applicationId: APP_ID }, SCANNED_BY, [
    { docType: 'siup', fullPath: 'Nasabah/SIUP.pdf', sha256: 'dup' },
    { docType: 'siup', fullPath: 'Nasabah/SIUP-copy.pdf', sha256: 'dup' }, // same docType+sha256
  ])
  assert.equal(res.added, 1)
  assert.equal(res.deduped, 1)
  assert.equal((await listManifest({ applicationId: APP_ID })).length, 1)
})

test('a CHANGED sha256 for the same docType adds a NEW version; latestPerDocType returns the newest', async () => {
  await appendScanEntries({ applicationId: APP_ID }, SCANNED_BY, [
    { docType: 'laporan_keuangan', fullPath: 'Pengajuan/LapKeu.pdf', sha256: 'v1' },
  ])
  // Doc changed → different sha256 → new version row (not a dedupe).
  const changed = await appendScanEntries({ applicationId: APP_ID }, SCANNED_BY, [
    { docType: 'laporan_keuangan', fullPath: 'Pengajuan/LapKeu.pdf', sha256: 'v2' },
  ])
  assert.equal(changed.added, 1)
  assert.equal(changed.deduped, 0)

  const history = await listManifest({ applicationId: APP_ID })
  assert.equal(history.filter((r) => r.docType === 'laporan_keuangan').length, 2, 'full history keeps both versions')

  const head = await latestPerDocType({ applicationId: APP_ID })
  assert.equal(head.get('laporan_keuangan')?.sha256, 'v2', 'head is the newest version')
})

test('app-scope and customer-scope rows do not bleed across scopes', async () => {
  await appendScanEntries({ applicationId: APP_ID }, SCANNED_BY, [
    { docType: 'ktp', fullPath: 'Pengajuan/KTP.pdf', sha256: 'app-ktp' },
  ])
  await appendScanEntries({ customerId: CUST_ID }, SCANNED_BY, [
    { docType: 'akta_pendirian', fullPath: 'Nasabah/Akta.pdf', sha256: 'cust-akta' },
  ])

  const appRows = await listManifest({ applicationId: APP_ID })
  assert.equal(appRows.length, 1)
  assert.equal(appRows[0].docType, 'ktp')
  assert.equal(appRows[0].customerId, null)

  const custRows = await listManifest({ customerId: CUST_ID })
  assert.equal(custRows.length, 1)
  assert.equal(custRows[0].docType, 'akta_pendirian')
  assert.equal(custRows[0].applicationId, null)
  assert.equal(custRows[0].customerId, CUST_ID)

  // Re-appending the app's sha256 under the customer scope is NOT a dedupe — different scope.
  const res = await appendScanEntries({ customerId: CUST_ID }, SCANNED_BY, [
    { docType: 'ktp', fullPath: 'Pengajuan/KTP.pdf', sha256: 'app-ktp' },
  ])
  assert.equal(res.added, 1)
  assert.equal(res.deduped, 0)
})
