import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplicationDocs } from './service'
import { ensureMizanDocFolder, retryDocShortcuts } from './mizan-drive'
import { retryDocShortcutsForActor } from '../actions/docs-shortcut.core'
import {
  clearStubDocsState,
  setStubShortcut403,
  stubShortcutsCreated,
  stubFoldersCreated,
} from '../google/stub-clients'
import { prisma } from '../db'
import type { Actor } from '../../lib/auth/can'

// Integration test (real Postgres *_test + DOCS_PROVIDER=stub) for P4-C (ADR-0019 §4): generated docs are
// MIZAN-OWNED (copied UNDER a per-app Mizan folder, parented) + a SHORTCUT is dropped into the user's app
// folder (Application.driveFolderId). A missing-Editor 403 surfaces a warning (never a throw) + "Coba lagi".
process.env.DOCS_PROVIDER = 'stub'
process.env.GOOGLE_MASTER_MUAP_DOC_ID ??= 'master-muap'
process.env.GOOGLE_MASTER_RSK_DOC_ID ??= 'master-rsk'

const WITH_FOLDER = 'ITEST-MIZANDRIVE-FOLDER'
const NO_FOLDER = 'ITEST-MIZANDRIVE-NOFOLDER'
const RETRY = 'ITEST-MIZANDRIVE-RETRY'
const ALL = [WITH_FOLDER, NO_FOLDER, RETRY]

const RM = 'u-itest-mizandrive-rm'

const baseApp = (id: string, driveFolderId: string | null) => ({
  id,
  nasabahName: 'Nasabah Uji',
  nasabahType: 'individual',
  phoneNumber: '0812',
  akadType: 'Murabahah',
  requestedPlafond: 100_000_000n,
  requestedTenorMonths: 12,
  purpose: 'modal kerja',
  stage: 3,
  enteredStageAt: new Date(),
  createdBy: 'tester',
  driveFolderId,
  hardGates: { dsr: 0, ltv: 0, kol: 1 },
  financialInputs: {
    netMonthlyIncome: 0,
    existingMonthlyObligations: 0,
    collateralAppraisedValue: 0,
    proposedMonthlyInstallment: null,
    projectedMonthlyProfitShare: null,
  },
  analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '', generated: false },
})

const actor = (desks: Actor['desks']): Actor => ({
  userId: RM,
  name: 'RM',
  avatarInitials: 'RM',
  desks,
  isSuperadmin: false,
})

async function cleanup() {
  await prisma.documentVersion.deleteMany({ where: { applicationId: { in: ALL } } })
  await prisma.docLinkage.deleteMany({ where: { applicationId: { in: ALL } } })
  await prisma.application.deleteMany({ where: { id: { in: ALL } } })
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await cleanup()
  clearStubDocsState()
})

after(async () => {
  await cleanup()
  await prisma.$disconnect()
})

test('createApplicationDocs lands the MUAP UNDER the Mizan-owned folder (parented) + persists mizanDocFolderId', async () => {
  await prisma.application.create({ data: baseApp(WITH_FOLDER, 'user-folder-1') })
  const linkage = await createApplicationDocs(WITH_FOLDER)
  assert.ok(linkage.muapDocId, 'MUAP minted')

  // A Mizan-owned folder was created and persisted on the application.
  const app = await prisma.application.findUnique({ where: { id: WITH_FOLDER }, select: { mizanDocFolderId: true } })
  assert.ok(app?.mizanDocFolderId, 'mizanDocFolderId persisted')
  assert.ok(stubFoldersCreated().has(app!.mizanDocFolderId!), 'the persisted folder id was created in Drive')
})

test('ensureMizanDocFolder is idempotent: a second call returns the same stored id (no new folder)', async () => {
  await prisma.application.create({ data: baseApp(WITH_FOLDER, null) })
  const first = await ensureMizanDocFolder(WITH_FOLDER)
  const foldersAfterFirst = stubFoldersCreated().size
  const second = await ensureMizanDocFolder(WITH_FOLDER)
  assert.equal(second, first, 'idempotent — same stored folder id')
  assert.equal(stubFoldersCreated().size, foldersAfterFirst, 'no second folder created')
})

test('a shortcut is created into the user folder when driveFolderId is set (targets the MUAP)', async () => {
  await prisma.application.create({ data: baseApp(WITH_FOLDER, 'user-folder-1') })
  const linkage = await createApplicationDocs(WITH_FOLDER)

  const shortcuts = [...stubShortcutsCreated().values()]
  assert.equal(shortcuts.length, 1, 'exactly one shortcut dropped (the MUAP)')
  assert.equal(shortcuts[0].targetId, linkage.muapDocId, 'shortcut targets the Mizan-owned MUAP doc')
  assert.deepEqual(shortcuts[0].parents, ['user-folder-1'], 'shortcut placed into the user app folder')

  // No warning recorded on a clean placement.
  const row = await prisma.docLinkage.findUnique({ where: { applicationId: WITH_FOLDER } })
  assert.equal(row?.shortcutWarning, null, 'clean placement → no warning')
})

test('no user folder: the doc is still minted Mizan-owned, no shortcut, no crash, no warning', async () => {
  await prisma.application.create({ data: baseApp(NO_FOLDER, null) })
  const linkage = await createApplicationDocs(NO_FOLDER)
  assert.ok(linkage.muapDocId, 'MUAP minted Mizan-owned even without a user folder')
  assert.equal(stubShortcutsCreated().size, 0, 'no shortcut placed (no user folder linked)')
  const row = await prisma.docLinkage.findUnique({ where: { applicationId: NO_FOLDER } })
  assert.equal(row?.shortcutWarning, null, 'no user folder → no warning (nothing owed)')
})

test('a 403 on the shortcut returns a WARNING (not a throw) + records it for "Coba lagi"', async () => {
  await prisma.application.create({ data: baseApp(WITH_FOLDER, 'user-folder-1') })
  setStubShortcut403(true) // the next shortcut create 403s (Mizan lacks Editor on the user folder)

  // createApplicationDocs MUST NOT throw on the 403 — the doc still lives Mizan-owned.
  const linkage = await createApplicationDocs(WITH_FOLDER)
  assert.ok(linkage.muapDocId, 'MUAP still minted despite the shortcut 403')

  const row = await prisma.docLinkage.findUnique({ where: { applicationId: WITH_FOLDER } })
  assert.match(row?.shortcutWarning ?? '', /tidak memiliki akses Editor/i, 'warning recorded for the panel')
})

test('retryDocShortcuts re-places the shortcut + clears the warning once Editor is granted', async () => {
  await prisma.application.create({ data: baseApp(RETRY, 'user-folder-retry') })
  setStubShortcut403(true)
  await createApplicationDocs(RETRY)
  let row = await prisma.docLinkage.findUnique({ where: { applicationId: RETRY } })
  assert.ok(row?.shortcutWarning, 'warning present after the first 403')

  // Editor now granted (no forced 403) → retry succeeds + clears the warning.
  const result = await retryDocShortcuts(RETRY)
  assert.deepEqual(result, {}, 'retry succeeds → no warning returned')
  row = await prisma.docLinkage.findUnique({ where: { applicationId: RETRY } })
  assert.equal(row?.shortcutWarning, null, 'warning cleared on a successful retry')
  // A shortcut targeting the MUAP now exists in the user folder.
  const placed = [...stubShortcutsCreated().values()].some((s) => s.parents?.[0] === 'user-folder-retry')
  assert.ok(placed, 'a shortcut was placed into the user folder on retry')
})

test('retryDocShortcutsForActor: participant gate passes; still-403 returns the warning', async () => {
  await prisma.application.create({ data: baseApp(RETRY, 'user-folder-retry') })
  setStubShortcut403(true)
  await createApplicationDocs(RETRY)

  // Still no Editor → the retry 403s again. The participant (a pipeline desk) is allowed to retry.
  setStubShortcut403(true)
  const result = await retryDocShortcutsForActor(actor(['intake']), RETRY)
  assert.match(result.warning ?? '', /tidak memiliki akses Editor/i, 'still-403 returns the warning, no throw')
})

test('retryDocShortcutsForActor: an observer (no pipeline desk) is rejected', async () => {
  await prisma.application.create({ data: baseApp(RETRY, 'user-folder-retry') })
  await createApplicationDocs(RETRY)
  await assert.rejects(
    () => retryDocShortcutsForActor(actor(['MG']), RETRY),
    /observer|akses baca|ditolak/i,
    'a non-participant cannot manage docs',
  )
})
