import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplicationDocs, ensureRskDoc } from './service'
import { ensureDocAccessForActor, reconcileFrozenDocGrants } from './access'
import { clearStubDocsState, stubDriveClient } from '../google/stub-clients'
import { prisma } from '../db'
import type { Actor } from '../../lib/auth/can'
import type { LoanApplication } from '../../lib/types'

// Integration test (real Postgres *_test + DOCS_PROVIDER=stub) for the just-in-time Drive
// grant: each human who opens a per-app MUAP/RSK Doc is shared at the right role so they
// never hit Google's "request access" wall. Asserts the DocAccessGrant ledger — role,
// idempotency/upgrade-only, the no-email skip, and (the headline) that an impersonating
// superadmin's grant goes to the SUPERADMIN's email, not the desk persona.
process.env.DOCS_PROVIDER = 'stub'
process.env.GOOGLE_MASTER_MUAP_DOC_ID ??= 'master-muap'
process.env.GOOGLE_MASTER_RSK_DOC_ID ??= 'master-rsk'

const APP = 'ITEST-ACCESS-1'
const RM = 'u-itest-access-rm'
const RA = 'u-itest-access-ra'
const SA = 'u-itest-access-sa'
const NOEMAIL = 'u-itest-access-noemail'

const actor = (userId: string, desks: Actor['desks'], impersonating?: Actor['impersonating']): Actor => ({
  userId,
  name: userId,
  avatarInitials: 'XX',
  desks,
  isSuperadmin: false,
  impersonating,
})
const app = (stage: number, komiteDecision?: LoanApplication['komiteDecision']) =>
  ({ id: APP, stage, komiteDecision } as LoanApplication)

async function cleanup() {
  await prisma.docAccessGrant.deleteMany({ where: { applicationId: APP } })
  await prisma.docLinkage.deleteMany({ where: { applicationId: APP } })
  await prisma.user.deleteMany({ where: { id: { in: [RM, RA, SA, NOEMAIL] } } })
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await cleanup()
  clearStubDocsState()
  await prisma.user.createMany({
    data: [
      { id: RM, email: 'rm.access@example.com', name: 'RM', avatarInitials: 'RM' },
      { id: RA, email: 'ra.access@example.com', name: 'RA', avatarInitials: 'RA' },
      { id: SA, email: 'sa.access@example.com', name: 'SA', avatarInitials: 'SA' },
      { id: NOEMAIL, email: null, name: 'NoEmail', avatarInitials: 'NE' },
    ],
  })
})

after(async () => {
  await cleanup()
  await prisma.$disconnect()
})

test('Batch 3 T3: createApplicationDocs makes the MUAP only; RSK is null until Stage-4 entry', async () => {
  const linkage = await createApplicationDocs(APP)
  assert.ok(linkage.muapDocId, 'MUAP created at Stage-3 entry')
  assert.equal(linkage.rskDocId, null, 'RSK NOT created yet (born at Stage-4 entry)')
  // With no RSK doc, an RSK maker gets only a MUAP reader grant — the RSK grant is simply skipped.
  const result = await ensureDocAccessForActor(actor(RA, ['rsk-author']), app(3), linkage)
  assert.deepEqual(result, { muap: 'reader', rsk: null })
})

test('maker gets writer on his own doc + reader on the downstream doc (RSK created at Stage 4)', async () => {
  const created = await createApplicationDocs(APP)
  const rskDocId = await ensureRskDoc(APP, {}) // Stage-4 entry: the RSK is now born
  assert.ok(rskDocId, 'RSK created on Stage-4 entry')
  const linkage = { muapDocId: created.muapDocId, rskDocId }
  // RA (rsk-author) is the RSK maker AND a downstream reader of the MUAP.
  const result = await ensureDocAccessForActor(actor(RA, ['rsk-author']), app(4), linkage)
  assert.deepEqual(result, { muap: 'reader', rsk: 'writer' })

  const grants = await prisma.docAccessGrant.findMany({ where: { applicationId: APP }, orderBy: { docId: 'asc' } })
  assert.equal(grants.length, 2)
  const byDoc = Object.fromEntries(grants.map((g) => [g.docId, g]))
  assert.equal(byDoc[rskDocId!].role, 'writer')
  assert.equal(byDoc[rskDocId!].email, 'ra.access@example.com')
  assert.equal(byDoc[linkage.muapDocId!].role, 'reader')
  assert.ok(byDoc[rskDocId!].permissionId, 'records the Drive permission id for a future revoke')
})

test('a doc that does not exist yet gets no grant (RSK born at Stage 4)', async () => {
  const linkage = await createApplicationDocs(APP)
  // createApplicationDocs makes the MUAP only (rskDocId null) → the RSK grant is simply skipped.
  // Read is universal, so the null here is the missing doc, NOT a view-gate. One grant row (MUAP).
  const result = await ensureDocAccessForActor(actor(RM, ['muap-author']), app(3), linkage)
  assert.deepEqual(result, { muap: 'writer', rsk: null })
  const grants = await prisma.docAccessGrant.findMany({ where: { applicationId: APP } })
  assert.equal(grants.length, 1)
  assert.equal(grants[0].docId, linkage.muapDocId)
})

test('universal read: MoM/SP3 doc ids on the linkage get a reader grant to any visitor', async () => {
  const linkage = await createApplicationDocs(APP)
  // Simulate MoM/SP3 having been generated (real stub doc ids linked on the row). Any authenticated
  // visitor — here an intake desk that is neither maker — gets reader on both, no request-access wall.
  const drive = stubDriveClient()
  const momDocId = (await drive.files.copy({ fileId: 'm', requestBody: { name: 'MOM test' } })).data.id!
  const sp3DocId = (await drive.files.copy({ fileId: 's', requestBody: { name: 'SP3 test' } })).data.id!
  const withMeetingDocs = { ...linkage, momDocId, sp3DocId }
  await ensureDocAccessForActor(actor(RM, ['intake']), app(5, 'approve'), withMeetingDocs)
  const mom = await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: momDocId, email: 'rm.access@example.com' } } })
  const sp3 = await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: sp3DocId, email: 'rm.access@example.com' } } })
  assert.equal(mom?.role, 'reader')
  assert.equal(sp3?.role, 'reader')
})

test('idempotent + upgrade-only: reader→writer upgrades; writer is never downgraded', async () => {
  const linkage = await createApplicationDocs(APP)
  const rm = actor(RM, ['muap-author'])
  // Stage 4 → muap-author is only a reader (past the edit window).
  await ensureDocAccessForActor(rm, app(4), linkage)
  let grant = await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: linkage.muapDocId!, email: 'rm.access@example.com' } } })
  assert.equal(grant?.role, 'reader')

  // Stage 3 → writer: upgrades the existing row in place (no duplicate).
  await ensureDocAccessForActor(rm, app(3), linkage)
  const all = await prisma.docAccessGrant.findMany({ where: { docId: linkage.muapDocId!, email: 'rm.access@example.com' } })
  assert.equal(all.length, 1, 'still one row (unique docId+email)')
  assert.equal(all[0].role, 'writer')

  // Back to stage 4 → ensureDocAccessForActor itself stays upgrade-only (it never lowers a role on
  // a mount fetch). The freeze downgrade is a SEPARATE explicit pass (reconcileFrozenDocGrants, below).
  await ensureDocAccessForActor(rm, app(4), linkage)
  grant = await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: linkage.muapDocId!, email: 'rm.access@example.com' } } })
  assert.equal(grant?.role, 'writer', 'mount fetch never auto-downgrades')
})

test('Batch 3 T2: reconcileFrozenDocGrants downgrades a writer once the doc freezes (not mid-stage)', async () => {
  const linkage = await createApplicationDocs(APP)
  const rm = actor(RM, ['muap-author'])
  // RM holds writer on the MUAP at Stage 3 (the edit window).
  await ensureDocAccessForActor(rm, app(3), linkage)
  assert.equal((await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: linkage.muapDocId!, email: 'rm.access@example.com' } } }))?.role, 'writer')

  // Mid-stage (still Stage 3, MUAP NOT frozen) → reconciliation is a no-op (do not downgrade mid-edit).
  await reconcileFrozenDocGrants(app(3), linkage)
  assert.equal((await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: linkage.muapDocId!, email: 'rm.access@example.com' } } }))?.role, 'writer', 'mid-stage stays writer')

  // Advance freezes the MUAP (Stage 4) → reconciliation downgrades the writer to reader.
  await reconcileFrozenDocGrants(app(4), linkage)
  assert.equal((await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: linkage.muapDocId!, email: 'rm.access@example.com' } } }))?.role, 'reader', 'frozen MUAP → writer downgraded (audit hole closed)')

  // Idempotent: a second pass keeps it reader, no error.
  await reconcileFrozenDocGrants(app(4), linkage)
  assert.equal((await prisma.docAccessGrant.findUnique({ where: { docId_email: { docId: linkage.muapDocId!, email: 'rm.access@example.com' } } }))?.role, 'reader')
})

test('superadmin impersonating a desk: the grant goes to the SUPERADMIN email, not the persona', async () => {
  const linkage = await createApplicationDocs(APP)
  // Desk-impersonation: userId is the synthetic "desk:muap-author" persona (no real user/email);
  // the human at the keyboard is the superadmin (SA).
  const impersonating = actor('desk:muap-author', ['muap-author'], { realSuperadminId: SA, realName: 'SA' })
  const result = await ensureDocAccessForActor(impersonating, app(3), linkage)
  assert.equal(result.muap, 'writer')

  const grants = await prisma.docAccessGrant.findMany({ where: { applicationId: APP } })
  assert.equal(grants.length, 1)
  assert.equal(grants[0].email, 'sa.access@example.com', 'shared to the superadmin, who actually opens the Doc')
  assert.equal(grants[0].grantedToUserId, SA)
})

test('email-less identity is skipped (no row, no Drive call)', async () => {
  const linkage = await createApplicationDocs(APP)
  const result = await ensureDocAccessForActor(actor(NOEMAIL, ['muap-author']), app(1), linkage)
  assert.deepEqual(result, { muap: null, rsk: null })
  const grants = await prisma.docAccessGrant.findMany({ where: { applicationId: APP } })
  assert.equal(grants.length, 0)
})
