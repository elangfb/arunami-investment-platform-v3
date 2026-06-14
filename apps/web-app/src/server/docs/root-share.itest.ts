import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureMizanRootFolder,
  ensureRootGrant,
  ensureRootGrantBestEffort,
  revokeRootGrant,
  reconcileRootShare,
} from './root-share'
import { ensureMizanDocFolder } from './mizan-drive'
import { driveClient } from '../google/clients'
import {
  clearStubDocsState,
  setStubPermissionCreateError,
  stubFoldersCreated,
  stubFolderParents,
  stubFolderPermissions,
  STUB_MYDRIVE_ROOT,
} from '../google/stub-clients'
import { prisma } from '../db'

// Integration test (real Postgres *_test + DOCS_PROVIDER=stub) for the ADR-0019 §3 V1 root-folder
// share (server/docs/root-share.ts): one root "Mizan" folder (DriveRef 'mizan-root') + ONE per-email
// 'reader' grant per ADMITTED user (superadmin or ≥1 effective desk) on that root (DriveRootGrant
// ledger); per-app Mizan-owned folders (mizan-drive.ts ensureMizanDocFolder) parent under the root so
// the grants inherit down. Covers: root resolve-or-create idempotency, grant create + short-circuit,
// the best-effort wrapper (null email no-op; a Drive failure NEVER throws — login must survive a
// Drive outage), the permanent-failure 'invalid' marker (a 4xx sharee rejection stops login-path
// retries; reconcile is the deliberate retry surface), revocation (offboarding by permissionId AND by
// permissions.list fallback), per-app folder parenting, and the reconcile sweep (admitted-only
// backfill + revoke-down + trust-but-verify re-grant/unledgered flag + MOVE-reparent of legacy flat
// folders — Drive is single-parent, so the stub models the implicit My Drive root as a sentinel
// parent and 403s a multi-parent result).
//
// ⚠️ Shared-DB caveat: the suite runs test FILES in parallel against one mizan_test database, and
// DriveRef 'mizan-root' is a GLOBAL singleton row that other docs itests also resolve (their
// ensureMizanDocFolder creates the root when the ref is missing). So outside the one creation-path
// test, each test PINS the ref to a folder created in THIS process's stub (other writers never
// overwrite an existing ref — first-writer-wins), and reconcile assertions are per-item exact but
// count-INCLUSIVE (>=): the sweep is global and may also see rows created concurrently by other files.
process.env.DOCS_PROVIDER = 'stub'

const ROOT_REF_KEY = 'mizan-root'
const PREFIX = 'itest-rootshare-'

const APP_NEW = 'ITEST-ROOTSHARE-NEW'
const APP_LEGACY = 'ITEST-ROOTSHARE-LEGACY'
const ALL_APPS = [APP_NEW, APP_LEGACY]

const U1 = 'u-itest-rootshare-1'
const U2 = 'u-itest-rootshare-2'
const U3 = 'u-itest-rootshare-3'
const U4 = 'u-itest-rootshare-4'
const ALL_USERS = [U1, U2, U3, U4]
const EMAIL1 = `${PREFIX}1@example.com`
const EMAIL2 = `${PREFIX}2@example.com`
const EMAIL3 = `${PREFIX}3@example.com`
const EMAIL4 = `${PREFIX}4@example.com`
const EMAIL_UNLEDGERED = `${PREFIX}unledgered@example.com`

const SUITE_START = new Date()

// An ADMITTED user (≥1 direct desk — UserDesk cascades on user delete). The root grant is scoped to
// admitted staff (the same boundary as the in-app awaiting-access wall); a desk-less user is not.
const admittedUser = (id: string, email: string, n: string) => ({
  id,
  email,
  name: `Uji ${n}`,
  avatarInitials: `U${n}`,
  desks: { create: { desk: 'intake', grantedBy: 'itest' } },
})

// Minimal valid Application row (same shape as mizan-drive.itest.ts baseApp).
const baseApp = (id: string, mizanDocFolderId: string | null = null) => ({
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
  driveFolderId: null,
  mizanDocFolderId,
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

/** Create a folder in THIS process's stub (mirrors a Drive folder the stub knows about). */
async function createStubFolder(name: string, parents?: string[]): Promise<string> {
  const drive = driveClient()
  const res = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', ...(parents ? { parents } : {}) },
    fields: 'id',
  })
  const id = res.data.id
  assert.ok(id, 'stub folder created')
  return id
}

/**
 * Pin DriveRef 'mizan-root' to a root folder created in THIS process's stub, so permissions.create /
 * files.update against the root resolve here (and a stale ref from a previous run or a concurrently
 * running test file can't point us at a folder this stub has never seen).
 */
async function seedRoot(): Promise<string> {
  const rootId = await createStubFolder('Mizan')
  await prisma.driveRef.upsert({
    where: { key: ROOT_REF_KEY },
    create: { key: ROOT_REF_KEY, folderId: rootId },
    update: { folderId: rootId },
  })
  return rootId
}

async function cleanup() {
  await prisma.driveRootGrant.deleteMany({
    // Our prefixed identities + anything the global reconcile sweep granted during this run (only
    // this file writes DriveRootGrant rows — the login path is not exercised by any itest).
    where: { OR: [{ email: { startsWith: PREFIX } }, { grantedAt: { gte: SUITE_START } }] },
  })
  await prisma.user.deleteMany({ where: { id: { in: ALL_USERS } } })
  await prisma.application.deleteMany({ where: { id: { in: ALL_APPS } } })
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
  // Drop a ref we left pointing at a deliberately-bogus folder id (the forced-failure test) so a
  // later run starts clean; an ordinary stub-folder ref is harmless (other files treat it loosely).
  await prisma.driveRef.deleteMany({ where: { key: ROOT_REF_KEY, folderId: { startsWith: PREFIX } } })
  await prisma.$disconnect()
})

test('ensureMizanRootFolder creates the root once + persists DriveRef; second call is a no-Drive-call no-op', async () => {
  await prisma.driveRef.deleteMany({ where: { key: ROOT_REF_KEY } })

  const first = await ensureMizanRootFolder()
  assert.ok(first, 'root folder id returned')
  assert.ok(stubFoldersCreated().has(first), 'the root folder was actually created in Drive')

  const ref = await prisma.driveRef.findUnique({ where: { key: ROOT_REF_KEY } })
  assert.equal(ref?.folderId, first, "DriveRef 'mizan-root' persists the created folder id")

  const foldersAfterFirst = stubFoldersCreated().size
  const second = await ensureMizanRootFolder()
  assert.equal(second, first, 'idempotent — same persisted root id')
  assert.equal(stubFoldersCreated().size, foldersAfterFirst, 'no second folder created')
})

test('ensureRootGrant grants reader on the root + records the ledger row; second call short-circuits', async () => {
  const rootId = await seedRoot()
  await prisma.user.create({ data: admittedUser(U1, EMAIL1, '1') })

  const first = await ensureRootGrant(U1, EMAIL1)
  assert.equal(first, 'granted')

  const perms = stubFolderPermissions(rootId)
  assert.equal(perms.length, 1, 'exactly one Drive permission created on the root')
  assert.deepEqual(perms[0], { role: 'reader', type: 'user', emailAddress: EMAIL1 }, 'per-email reader grant')

  const row = await prisma.driveRootGrant.findUnique({ where: { email: EMAIL1 } })
  assert.ok(row, 'DriveRootGrant ledger row recorded')
  assert.equal(row.userId, U1)
  assert.equal(row.role, 'reader')
  assert.ok(row.permissionId, 'Drive permission id kept for a future revoke')

  // Second call: the ledger row short-circuits — no new Drive permission, no duplicate row.
  const second = await ensureRootGrant(U1, EMAIL1)
  assert.equal(second, 'skipped', 'reader row short-circuits')
  assert.equal(stubFolderPermissions(rootId).length, 1, 'no duplicate Drive permission')
  assert.equal(await prisma.driveRootGrant.count({ where: { email: EMAIL1 } }), 1, 'still exactly one ledger row')
})

test('ensureRootGrantBestEffort: null/empty email is a silent no-op (seeded demo actors)', async () => {
  const rootId = await seedRoot()
  await ensureRootGrantBestEffort(U3, null)
  await ensureRootGrantBestEffort(U3, undefined)
  await ensureRootGrantBestEffort(U3, '')
  assert.equal(stubFolderPermissions(rootId).length, 0, 'no Drive call made')
  assert.equal(await prisma.driveRootGrant.count({ where: { userId: U3 } }), 0, 'no ledger row created')
})

test('ensureRootGrantBestEffort NEVER throws on a Drive failure (login must survive a Drive outage)', async () => {
  // Point the persisted root at a folder id the stub has never seen → permissions.create throws
  // (the stub fails loudly on unknown ids, standing in for a real Drive outage / unconfigured provider).
  await prisma.driveRef.upsert({
    where: { key: ROOT_REF_KEY },
    create: { key: ROOT_REF_KEY, folderId: `${PREFIX}bogus-root` },
    update: { folderId: `${PREFIX}bogus-root` },
  })

  // The throwing variant proves the failure is real…
  await assert.rejects(() => ensureRootGrant(U3, EMAIL3), /unknown fileId/, 'ensureRootGrant surfaces the Drive failure')
  // …and the best-effort wrapper swallows it (logs docs.root_grant_failed) without a ledger row.
  await ensureRootGrantBestEffort(U3, EMAIL3) // must resolve, not reject
  assert.equal(await prisma.driveRootGrant.count({ where: { email: EMAIL3 } }), 0, 'failed grant leaves no ledger row')
})

test("a PERMANENT Drive rejection (4xx ≠ 429) writes the 'invalid' marker, stops login-path retries, and only a deliberate retry re-attempts", async () => {
  const rootId = await seedRoot()
  await prisma.user.create({ data: admittedUser(U1, EMAIL1, '1') })

  // 1. Drive refuses the sharee (e.g. a non-Google email) → 'invalid' marker, NO throw.
  setStubPermissionCreateError(400)
  const first = await ensureRootGrant(U1, EMAIL1)
  assert.equal(first, 'invalid', 'permanent rejection returns invalid (does not throw)')
  const marked = await prisma.driveRootGrant.findUnique({ where: { email: EMAIL1 } })
  assert.equal(marked?.role, 'invalid', "'invalid' marker row written")
  assert.equal(marked?.permissionId, null)
  assert.equal(stubFolderPermissions(rootId).length, 0, 'no Drive permission exists')

  // 2. The login path (no retryInvalid) short-circuits: NO Drive call — a working permissions.create
  //    (no forced error now) would otherwise have succeeded and flipped the row to reader.
  const second = await ensureRootGrant(U1, EMAIL1)
  assert.equal(second, 'invalid', 'marker short-circuits the login path')
  assert.equal(stubFolderPermissions(rootId).length, 0, 'short-circuit made no Drive call')
  assert.equal((await prisma.driveRootGrant.findUnique({ where: { email: EMAIL1 } }))?.role, 'invalid')

  // 3. The deliberate retry surface (retryInvalid — what reconcile passes) re-attempts; a permanent
  //    failure AGAIN stays 'invalid' (reconcile counts these separately from transient 'failed')…
  setStubPermissionCreateError(403)
  const third = await ensureRootGrant(U1, EMAIL1, { retryInvalid: true })
  assert.equal(third, 'invalid', 'permanently-failing again stays invalid')

  // 4. …and once Drive accepts the sharee, the retry converges the row to a real reader grant.
  const fourth = await ensureRootGrant(U1, EMAIL1, { retryInvalid: true })
  assert.equal(fourth, 'granted')
  const healed = await prisma.driveRootGrant.findUnique({ where: { email: EMAIL1 } })
  assert.equal(healed?.role, 'reader')
  assert.ok(healed?.permissionId, 'permissionId recorded on the healed grant')
  assert.equal(stubFolderPermissions(rootId).filter((p) => p.emailAddress === EMAIL1).length, 1)
})

test('revokeRootGrant removes the Drive permission (by permissionId AND by list-fallback) + deletes the ledger row', async () => {
  const rootId = await seedRoot()
  await prisma.user.createMany({
    data: [
      { id: U1, email: EMAIL1, name: 'Uji 1', avatarInitials: 'U1' },
      { id: U2, email: EMAIL2, name: 'Uji 2', avatarInitials: 'U2' },
    ],
  })

  // (a) By stored permissionId.
  await ensureRootGrant(U1, EMAIL1)
  assert.equal(await revokeRootGrant(EMAIL1), true)
  assert.equal(stubFolderPermissions(rootId).filter((p) => p.emailAddress === EMAIL1).length, 0, 'Drive permission removed')
  assert.equal(await prisma.driveRootGrant.count({ where: { email: EMAIL1 } }), 0, 'ledger row deleted')

  // (b) Without a stored permissionId → permissions.list fallback matched by emailAddress.
  await ensureRootGrant(U2, EMAIL2)
  await prisma.driveRootGrant.update({ where: { email: EMAIL2 }, data: { permissionId: null } })
  assert.equal(await revokeRootGrant(EMAIL2), true)
  assert.equal(stubFolderPermissions(rootId).filter((p) => p.emailAddress === EMAIL2).length, 0, 'fallback found + removed the permission')
  assert.equal(await prisma.driveRootGrant.count({ where: { email: EMAIL2 } }), 0)

  // (c) No ledger row → no-op.
  assert.equal(await revokeRootGrant(EMAIL3), false)
})

test('ensureMizanDocFolder parents the per-app folder under the root "Mizan" folder', async () => {
  const rootId = await seedRoot()
  await prisma.application.create({ data: baseApp(APP_NEW) })

  const folderId = await ensureMizanDocFolder(APP_NEW)
  assert.ok(stubFoldersCreated().has(folderId), 'per-app folder created in Drive')
  assert.deepEqual(stubFolderParents(folderId), [rootId], 'per-app folder parented under the root (grants inherit down)')

  const app = await prisma.application.findUnique({ where: { id: APP_NEW }, select: { mizanDocFolderId: true } })
  assert.equal(app?.mizanDocFolderId, folderId, 'mizanDocFolderId persisted')
})

test('reconcileRootShare backfills ADMITTED users only, revokes the no-longer-admitted, and MOVE-reparents legacy flat folders', async () => {
  const rootId = await seedRoot()

  // U1: admitted + already granted (live permission + ledger row) → skipped, no duplicate.
  // U2: admitted, no grant → granted. U4: registered but ZERO-desk (awaiting access) → NOT granted,
  // and its stale pre-existing grant (admitted once, offboarded since) → revoked.
  await prisma.user.create({ data: admittedUser(U1, EMAIL1, '1') })
  await prisma.user.create({ data: admittedUser(U2, EMAIL2, '2') })
  await prisma.user.create({ data: { id: U4, email: EMAIL4, name: 'Uji 4', avatarInitials: 'U4' } })
  await ensureRootGrant(U1, EMAIL1)
  await ensureRootGrant(U4, EMAIL4) // stale: ensureRootGrant itself doesn't gate; the sweep must
  assert.equal(stubFolderPermissions(rootId).filter((p) => p.emailAddress === EMAIL4).length, 1)

  // APP_LEGACY: flat folder (created before the root existed → implicit My Drive root sentinel
  // parent, the legacy way) → MOVED under the root. APP_NEW: already parented → skipped, untouched.
  const legacyFolder = await createStubFolder(`Dokumen Mizan — ${APP_LEGACY}`)
  assert.deepEqual(stubFolderParents(legacyFolder), [STUB_MYDRIVE_ROOT], 'legacy flat folder sits under the implicit My Drive root')
  const parentedFolder = await createStubFolder(`Dokumen Mizan — ${APP_NEW}`, [rootId])
  await prisma.application.create({ data: baseApp(APP_LEGACY, legacyFolder) })
  await prisma.application.create({ data: baseApp(APP_NEW, parentedFolder) })

  const result = await reconcileRootShare()

  // Per-item outcomes are exact; counts are inclusive (>=) because the sweep is global and the
  // suite's other test files may concurrently hold users/apps in the shared mizan_test DB.
  const granted = await prisma.driveRootGrant.findUnique({ where: { email: EMAIL2 } })
  assert.ok(granted, 'ungranted ADMITTED user got a ledger row')
  assert.equal(granted.userId, U2)
  assert.ok(
    stubFolderPermissions(rootId).some((p) => p.emailAddress === EMAIL2 && p.role === 'reader'),
    'reader permission created on the root for the backfilled user',
  )
  assert.equal(
    stubFolderPermissions(rootId).filter((p) => p.emailAddress === EMAIL1).length,
    1,
    'already-granted user short-circuits — no duplicate Drive permission',
  )

  // Admitted boundary: the zero-desk user gained nothing and LOST its stale grant (revoke-down).
  assert.equal(await prisma.driveRootGrant.count({ where: { email: EMAIL4 } }), 0, 'zero-desk user has no ledger row')
  assert.equal(
    stubFolderPermissions(rootId).filter((p) => p.emailAddress === EMAIL4).length,
    0,
    'zero-desk user has no Drive read on the customer-PII tree',
  )

  // Reparent is a MOVE: the implicit-root sentinel parent was REMOVED (single-parent Drive).
  assert.deepEqual(stubFolderParents(legacyFolder), [rootId], 'legacy flat folder moved under the root (old parent removed)')
  assert.deepEqual(stubFolderParents(parentedFolder), [rootId], 'already-parented folder untouched (no duplicate parent)')

  assert.ok(result.granted >= 1, `granted counts the backfilled user (got ${result.granted})`)
  assert.ok(result.revoked >= 1, `revoked counts the offboarded user (got ${result.revoked})`)
  assert.ok(result.reparented >= 1, `reparented counts the legacy folder (got ${result.reparented})`)
  assert.ok(result.skipped >= 2, `skipped counts the pre-granted user + the parented folder (got ${result.skipped})`)

  // Sweep is idempotent for our rows: a second pass grants/reparents nothing new for them.
  await reconcileRootShare()
  assert.equal(await prisma.driveRootGrant.count({ where: { email: EMAIL2 } }), 1, 'no duplicate ledger row')
  assert.deepEqual(stubFolderParents(legacyFolder), [rootId], 'no duplicate parent on the second pass')
})

test("reconcileRootShare retries 'invalid' rows (deliberate surface) and converges them to reader once Drive accepts", async () => {
  const rootId = await seedRoot()
  await prisma.user.create({ data: admittedUser(U1, EMAIL1, '1') })
  // The login path marked this email invalid earlier (e.g. a typo'd non-Google address since fixed).
  await prisma.driveRootGrant.create({ data: { userId: U1, email: EMAIL1, role: 'invalid', permissionId: null } })

  const result = await reconcileRootShare()

  const row = await prisma.driveRootGrant.findUnique({ where: { email: EMAIL1 } })
  assert.equal(row?.role, 'reader', "the 'invalid' marker was re-attempted and healed to reader")
  assert.ok(row?.permissionId)
  assert.ok(
    stubFolderPermissions(rootId).some((p) => p.emailAddress === EMAIL1 && p.role === 'reader'),
    'live Drive permission created on the retry',
  )
  assert.ok(result.granted >= 1)
})

test('reconcileRootShare trust-but-verify: re-grants a ledgered reader Drive dropped; flags (does not remove) unledgered live grants', async () => {
  const rootId = await seedRoot()
  await prisma.user.create({ data: admittedUser(U2, EMAIL2, '2') })
  // Ledger says reader, but Drive-side the permission is GONE (someone removed it in the Drive UI):
  // a bare ledger row with a permissionId the stub never minted models exactly that drift.
  await prisma.driveRootGrant.create({
    data: { userId: U2, email: EMAIL2, role: 'reader', permissionId: `${PREFIX}vanished-perm` },
  })
  // And a live permission Mizan never ledgered (granted out-of-band in the Drive UI).
  await driveClient().permissions.create({
    fileId: rootId,
    requestBody: { type: 'user', role: 'reader', emailAddress: EMAIL_UNLEDGERED },
    fields: 'id',
  })

  const result = await reconcileRootShare()

  assert.ok(
    stubFolderPermissions(rootId).some((p) => p.emailAddress === EMAIL2 && p.role === 'reader'),
    'vanished ledgered reader was re-granted on Drive',
  )
  const row = await prisma.driveRootGrant.findUnique({ where: { email: EMAIL2 } })
  assert.ok(row?.permissionId, 'permissionId present after re-grant')
  assert.notEqual(row?.permissionId, `${PREFIX}vanished-perm`, 'permissionId refreshed to the new live permission')
  assert.ok(result.regranted >= 1, `regranted counts the drift repair (got ${result.regranted})`)

  assert.ok(result.unledgered >= 1, `unledgered live grant flagged (got ${result.unledgered})`)
  assert.equal(
    stubFolderPermissions(rootId).filter((p) => p.emailAddress === EMAIL_UNLEDGERED).length,
    1,
    'unledgered grant is flagged but NOT auto-removed (human call)',
  )

  // The out-of-band grantee has no User row → it must also not be adopted into the ledger.
  assert.equal(await prisma.driveRootGrant.count({ where: { email: EMAIL_UNLEDGERED } }), 0)
})
