import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  runDiscoveryForActor,
  linkDriveFolderForActor,
  listSourceManifestForActor,
} from './discovery-actions.core'
import { __seedStubFolder, __resetStubFolders } from '../discovery/stub'
import { createApplicationForActor } from './application-create.core'
import { prisma } from '../db'
import type { Actor } from '@/lib/auth/can'

// We test the actor-INJECTED cores (discovery-actions.core.ts) with a deterministic RM actor — the
// repo pattern (mirrors application-create.core.ts), no Firebase session / module mock needed. The
// thin 'use server' wrappers in discovery-actions.ts just add requireActor() over these cores.
// Everything else (Postgres, the stub Drive provider) is real.
const RM_ACTOR: Actor = {
  userId: 'itest-disc-actions',
  name: 'Disc Actions RM',
  avatarInitials: 'DA',
  desks: ['intake'],
  isSuperadmin: false,
}

// Integration test (real Postgres, *_test DB only). Proves the discovery SERVER ACTIONS end-to-end
// against the STUB Drive provider (DRIVE_PROVIDER defaults to 'stub'):
//  - linkDriveFolderAction persists the right driveFolderId (customer row vs application row) and
//    returns a DiscoveryStatus whose cards reflect the seeded files;
//  - a nasabah doc satisfies the nasabah card, NOT the pengajuan card;
//  - runDiscoveryAction reports the *Linked flags;
//  - listSourceManifestAction returns the appended ledger rows per scope.
// Discovery never reads bytes: the stub tree is paths + sha256 only.

const SCANNED_BY = RM_ACTOR.userId
const UNIQUE_NIK = '3299990000000091'
const NASABAH_FOLDER_URL = 'https://drive.google.com/drive/folders/1Nasabah_Folder_Id_abcdefgh'
const NASABAH_FOLDER_ID = '1Nasabah_Folder_Id_abcdefgh'
const APP_FOLDER_ID = '1App_Folder_Id_abcdefghijkl'

let APP_ID: string
let CUST_ID: string

async function cleanRows(): Promise<void> {
  await prisma.sourceDocManifestEntry.deleteMany({ where: { scannedBy: SCANNED_BY } })
}

before(async () => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
  // Individual Murabahah + fixed_asset → required docs include ktp/npwp/kartu_keluarga (nasabah)
  // and quotation_objek/sertifikat_agunan/rekening_koran_pribadi (app).
  const app = await createApplicationForActor(RM_ACTOR, {
    nasabahName: 'Disc Action Test',
    nasabahType: 'individual',
    phoneNumber: '081200000091',
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
})

beforeEach(async () => {
  await cleanRows()
  __resetStubFolders()
  // Reset folder refs between tests so the *Linked flags are deterministic.
  await prisma.application.update({ where: { id: APP_ID }, data: { driveFolderId: null, driveFolderOwner: null } })
  await prisma.customer.update({ where: { id: CUST_ID }, data: { driveFolderId: null, driveFolderOwner: null } })
})

after(async () => {
  await cleanRows()
  __resetStubFolders()
  await prisma.application.deleteMany({ where: { createdBy: SCANNED_BY } })
  await prisma.customer.deleteMany({ where: { createdBy: SCANNED_BY } })
  await prisma.$disconnect()
})

test('linkDriveFolderAction (nasabah) persists driveFolderId on the customer and a nasabah doc satisfies the nasabah card only', async () => {
  __seedStubFolder(NASABAH_FOLDER_ID, [
    { path: 'Nasabah/KTP Budi.pdf', fileId: 'drv-ktp', sha256: 'sha-ktp' },
  ])

  // Link via a full Drive URL — the action parses it to the canonical id.
  const status = await linkDriveFolderForActor(RM_ACTOR, APP_ID, 'nasabah', NASABAH_FOLDER_URL)

  // Persisted on the CUSTOMER row (direct prisma), owner 'user'.
  const cust = await prisma.customer.findUniqueOrThrow({
    where: { id: CUST_ID },
    select: { driveFolderId: true, driveFolderOwner: true },
  })
  assert.equal(cust.driveFolderId, NASABAH_FOLDER_ID)
  assert.equal(cust.driveFolderOwner, 'user')

  // Cards reflect the seeded file: nasabah KTP satisfied; not present on the pengajuan card.
  assert.equal(status.nasabahFolderLinked, true)
  assert.equal(status.appFolderLinked, false)
  const nasabahKtp = status.result.nasabah.matches.find((m) => m.docType === 'ktp')
  assert.ok(nasabahKtp, 'ktp is a nasabah-card item')
  assert.equal(nasabahKtp.state, 'satisfied')
  assert.deepEqual(nasabahKtp.matchedPaths, ['Nasabah/KTP Budi.pdf'])
  assert.equal(
    status.result.pengajuan.matches.find((m) => m.docType === 'ktp'),
    undefined,
    'ktp must not appear on the pengajuan card',
  )
})

test('linkDriveFolderAction (app) persists driveFolderId on the application row and satisfies the pengajuan card', async () => {
  __seedStubFolder(APP_FOLDER_ID, [
    { path: 'Pengajuan/Quotation Objek.pdf', fileId: 'drv-quote', sha256: 'sha-quote' },
  ])

  const status = await linkDriveFolderForActor(RM_ACTOR, APP_ID, 'app', APP_FOLDER_ID)

  const appRow = await prisma.application.findUniqueOrThrow({
    where: { id: APP_ID },
    select: { driveFolderId: true, driveFolderOwner: true },
  })
  assert.equal(appRow.driveFolderId, APP_FOLDER_ID)
  assert.equal(appRow.driveFolderOwner, 'user')

  assert.equal(status.appFolderLinked, true)
  const quote = status.result.pengajuan.matches.find((m) => m.docType === 'quotation_objek')
  assert.ok(quote, 'quotation_objek is a pengajuan-card item')
  assert.equal(quote.state, 'satisfied')
})

test('linkDriveFolderAction rejects junk input with a Bahasa error', async () => {
  await assert.rejects(
    () => linkDriveFolderForActor(RM_ACTOR, APP_ID, 'app', 'not a folder'),
    /URL\/ID folder tidak valid/,
  )
})

test('runDiscoveryAction reports the *Linked flags from the persisted refs', async () => {
  await prisma.customer.update({ where: { id: CUST_ID }, data: { driveFolderId: NASABAH_FOLDER_ID } })
  __seedStubFolder(NASABAH_FOLDER_ID, [])

  const status = await runDiscoveryForActor(RM_ACTOR, APP_ID)
  assert.equal(status.nasabahFolderLinked, true)
  assert.equal(status.appFolderLinked, false, 'app folder still unlinked')
})

test('listSourceManifestAction returns the appended ledger rows per scope', async () => {
  __seedStubFolder(NASABAH_FOLDER_ID, [
    { path: 'Nasabah/KTP Budi.pdf', fileId: 'drv-ktp', sha256: 'sha-ktp' },
  ])
  __seedStubFolder(APP_FOLDER_ID, [
    { path: 'Pengajuan/Quotation Objek.pdf', fileId: 'drv-quote', sha256: 'sha-quote' },
  ])

  // Link both, which re-scans and appends satisfied matches to the ledger.
  await linkDriveFolderForActor(RM_ACTOR, APP_ID, 'nasabah', NASABAH_FOLDER_ID)
  await linkDriveFolderForActor(RM_ACTOR, APP_ID, 'app', APP_FOLDER_ID)

  const manifest = await listSourceManifestForActor(RM_ACTOR, APP_ID)
  const custKtp = manifest.nasabah.find((r) => r.docType === 'ktp')
  assert.ok(custKtp, 'nasabah KTP appended under the customer scope')
  assert.equal(custKtp.fullPath, 'Nasabah/KTP Budi.pdf')
  assert.equal(typeof custKtp.scannedAt, 'string', 'scannedAt serialized to an ISO string')

  const appQuote = manifest.app.find((r) => r.docType === 'quotation_objek')
  assert.ok(appQuote, 'app quotation appended under the application scope')
  assert.equal(appQuote.fullPath, 'Pengajuan/Quotation Objek.pdf')
  // The nasabah doc must NOT appear under the app scope.
  assert.equal(manifest.app.find((r) => r.docType === 'ktp'), undefined)
})
