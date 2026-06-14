import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { discoverForApp } from './discover'
import { __seedStubFolder, __resetStubFolders } from './stub'
import { listManifest } from '../repo/source-manifest'
import { createApplicationForActor } from '../actions/application-create.core'
import { prisma } from '../db'
import type { Actor } from '@/lib/auth/can'

// Integration test (real Postgres, *_test DB only — see scripts/test-integration.sh).
// Proves the document-discovery SERVICE (RM-led redesign, design §3) end-to-end against the STUB
// Drive provider (DRIVE_PROVIDER defaults to 'stub'):
//  - a KTP file in the NASABAH folder satisfies the nasabah KTP item (Dokumen Nasabah card)
//  - a per-deal doc in the APP folder satisfies its item (Dokumen Pengajuan card)
//  - the two cards are split: a nasabah doc does NOT appear on the pengajuan card
//  - an unrecognized junk file lands in unrecognized[]
//  - the manifest ledger got the satisfied entries under the right scope (customer vs application)
//  - a null app.driveFolderId yields an all-missing pengajuan card without throwing
//
// Discovery NEVER reads bytes: the stub tree is paths + sha256 only. The app is a real row created
// via createApplicationForActor (which links a Customer 1:1); we set both driveFolderId refs via
// prisma.update, stage a fake tree with __seedStubFolder, then scan.

const SCANNED_BY = 'itest-discovery'
const UNIQUE_NIK = '3299990000000088' // unlikely to collide with other itests' dedup

const rmActor: Actor = {
  userId: SCANNED_BY,
  name: 'Disc RM',
  avatarInitials: 'DR',
  desks: ['intake'],
  isSuperadmin: false,
}

let APP_ID: string
let CUST_ID: string
const NASABAH_FOLDER = 'stub-nasabah-folder'
const APP_FOLDER = 'stub-app-folder'

async function cleanRows(): Promise<void> {
  await prisma.sourceDocManifestEntry.deleteMany({ where: { scannedBy: SCANNED_BY } })
}

before(async () => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
  // Individual Murabahah + fixed_asset → required docs include: ktp/npwp/kartu_keluarga (nasabah),
  // quotation_objek/sertifikat_agunan/rekening_koran_pribadi (app).
  const app = await createApplicationForActor(rmActor, {
    nasabahName: 'Disc Test',
    nasabahType: 'individual',
    phoneNumber: '081200000088',
    nik: UNIQUE_NIK,
    akadType: 'Murabahah',
    collateralType: 'fixed_asset',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
  })
  APP_ID = app.id
  const row = await prisma.application.findUniqueOrThrow({
    where: { id: APP_ID },
    select: { customerId: true },
  })
  CUST_ID = row.customerId!
  assert.ok(CUST_ID, 'createApplicationForActor should link a Customer 1:1')

  // Link both Drive folders.
  await prisma.customer.update({ where: { id: CUST_ID }, data: { driveFolderId: NASABAH_FOLDER, driveFolderOwner: 'mizan' } })
  await prisma.application.update({ where: { id: APP_ID }, data: { driveFolderId: APP_FOLDER, driveFolderOwner: 'mizan' } })
})

beforeEach(async () => {
  await cleanRows()
  __resetStubFolders()
})

after(async () => {
  await cleanRows()
  __resetStubFolders()
  await prisma.application.deleteMany({ where: { createdBy: SCANNED_BY } })
  await prisma.customer.deleteMany({ where: { createdBy: SCANNED_BY } })
  await prisma.$disconnect()
})

async function loadApp() {
  // The discovery service only needs the domain aggregate's required-docs + driveFolderId; it reads
  // the customer link itself. Build a minimal aggregate from the real row.
  const { getCustomerWithApplications } = await import('../repo/customer')
  const data = await getCustomerWithApplications(CUST_ID)
  assert.ok(data)
  const app = data.applications.find((a) => a.id === APP_ID)
  assert.ok(app, 'app should load under its customer')
  return app
}

test('a KTP in the nasabah folder satisfies the nasabah KTP item; a per-deal doc satisfies the app card; cards are split', async () => {
  __seedStubFolder(NASABAH_FOLDER, [
    { path: 'Nasabah/KTP Budi.pdf', fileId: 'drv-ktp', sha256: 'sha-ktp' },
  ])
  __seedStubFolder(APP_FOLDER, [
    { path: 'Pengajuan/Quotation Objek.pdf', fileId: 'drv-quote', sha256: 'sha-quote' },
  ])

  const app = await loadApp()
  const result = await discoverForApp(app, SCANNED_BY)

  // Nasabah card: KTP satisfied.
  const nasabahKtp = result.nasabah.matches.find((m) => m.docType === 'ktp')
  assert.ok(nasabahKtp, 'ktp should be a nasabah-card item')
  assert.equal(nasabahKtp.state, 'satisfied')
  assert.deepEqual(nasabahKtp.matchedPaths, ['Nasabah/KTP Budi.pdf'])

  // Split: ktp must NOT appear on the pengajuan card at all.
  assert.equal(
    result.pengajuan.matches.find((m) => m.docType === 'ktp'),
    undefined,
    'ktp is nasabah-scope and must not appear on the pengajuan card',
  )

  // App card: quotation_objek satisfied (per-deal doc).
  const quote = result.pengajuan.matches.find((m) => m.docType === 'quotation_objek')
  assert.ok(quote, 'quotation_objek should be a pengajuan-card item')
  assert.equal(quote.state, 'satisfied')
  assert.deepEqual(quote.matchedPaths, ['Pengajuan/Quotation Objek.pdf'])

  // The nasabah KTP file is not seen by the app card (separate folder).
  const appKtp = result.pengajuan.unrecognized.includes('Nasabah/KTP Budi.pdf')
  assert.equal(appKtp, false, 'the nasabah folder is not listed for the app card')
})

test('an unrecognized junk file lands in unrecognized[]', async () => {
  __seedStubFolder(NASABAH_FOLDER, [
    { path: 'Nasabah/Catatan Acak.pdf', fileId: 'drv-junk', sha256: 'sha-junk' },
  ])
  __seedStubFolder(APP_FOLDER, [])

  const app = await loadApp()
  const result = await discoverForApp(app, SCANNED_BY)

  assert.ok(
    result.unrecognized.includes('Nasabah/Catatan Acak.pdf'),
    'a file matching zero items is unrecognized',
  )
})

test('the manifest ledger gets the satisfied entries under the right scope', async () => {
  __seedStubFolder(NASABAH_FOLDER, [
    { path: 'Nasabah/KTP Budi.pdf', fileId: 'drv-ktp', sha256: 'sha-ktp' },
  ])
  __seedStubFolder(APP_FOLDER, [
    { path: 'Pengajuan/Quotation Objek.pdf', fileId: 'drv-quote', sha256: 'sha-quote' },
  ])

  const app = await loadApp()
  await discoverForApp(app, SCANNED_BY)

  const custRows = await listManifest({ customerId: CUST_ID })
  const custKtp = custRows.find((r) => r.docType === 'ktp')
  assert.ok(custKtp, 'nasabah KTP should be appended under the customer scope')
  assert.equal(custKtp.sha256, 'sha-ktp')
  assert.equal(custKtp.fileId, 'drv-ktp')
  assert.equal(custKtp.fullPath, 'Nasabah/KTP Budi.pdf')

  const appRows = await listManifest({ applicationId: APP_ID })
  const appQuote = appRows.find((r) => r.docType === 'quotation_objek')
  assert.ok(appQuote, 'app quotation should be appended under the application scope')
  assert.equal(appQuote.sha256, 'sha-quote')
  // The nasabah doc must NOT be appended under the app scope.
  assert.equal(appRows.find((r) => r.docType === 'ktp'), undefined)
})

test('a null app.driveFolderId yields an all-missing pengajuan card without throwing', async () => {
  // Detach the app folder (the customer folder stays linked).
  await prisma.application.update({ where: { id: APP_ID }, data: { driveFolderId: null } })
  __seedStubFolder(NASABAH_FOLDER, [
    { path: 'Nasabah/KTP Budi.pdf', fileId: 'drv-ktp', sha256: 'sha-ktp' },
  ])

  const app = await loadApp()
  const result = await discoverForApp(app, SCANNED_BY)

  assert.ok(result.pengajuan.matches.length > 0, 'pengajuan card still lists its items')
  assert.ok(
    result.pengajuan.matches.every((m) => m.state === 'missing'),
    'every pengajuan item is missing when the app folder ref is null',
  )
  assert.deepEqual(result.pengajuan.unrecognized, [])

  // Restore for any later tests.
  await prisma.application.update({ where: { id: APP_ID }, data: { driveFolderId: APP_FOLDER } })
})
