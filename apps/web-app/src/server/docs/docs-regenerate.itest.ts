import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplicationDocs, ensureRskDoc, freezeDecisionDocs, regenerateApplicationDocs, rollbackApplicationDocVersion, snapshotApplicationDocs } from './service'
import { clearStubDocsState } from '../google/stub-clients'
import { prisma } from '../db'

// Integration test (real Postgres *_test + DOCS_PROVIDER=stub) for the create-vs-regenerate
// distinction (RegenerateMuap, workflow-engine-build.md Phase 5): create is idempotent (returns the
// existing linkage); regenerate forces a fresh copy + replaces the linkage — the post-ReviseProposal
// path where the MUAP/RSK became stale. The stub Drive mints a fresh doc id per copy.
process.env.DOCS_PROVIDER = 'stub'
process.env.GOOGLE_MASTER_MUAP_DOC_ID ??= 'master-muap'
process.env.GOOGLE_MASTER_RSK_DOC_ID ??= 'master-rsk'

const APP = 'ITEST-REGEN-1'
const NONE = 'ITEST-REGEN-NONE'
const ROLLBACK = 'ITEST-REGEN-ROLLBACK'
const ABSENT = 'ITEST-REGEN-MUAP-ABSENT'
before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await prisma.documentVersion.deleteMany({ where: { applicationId: { in: [APP, NONE, ROLLBACK, ABSENT] } } })
  await prisma.docLinkage.deleteMany({ where: { applicationId: { in: [APP, NONE, ROLLBACK, ABSENT] } } })
  await prisma.application.deleteMany({ where: { id: ROLLBACK } })
  clearStubDocsState()
})

after(async () => {
  await prisma.documentVersion.deleteMany({ where: { applicationId: { in: [APP, NONE, ROLLBACK, ABSENT] } } })
  await prisma.docLinkage.deleteMany({ where: { applicationId: { in: [APP, NONE, ROLLBACK, ABSENT] } } })
  await prisma.application.deleteMany({ where: { id: ROLLBACK } })
  await prisma.$disconnect()
})

test('createApplicationDocs is idempotent (MUAP only, Batch 3 T3); regenerate re-mints what exists + checkpoints it', async () => {
  const first = await createApplicationDocs(APP)
  assert.equal(first.rskDocId, null, 'create makes the MUAP only — RSK is born at Stage-4 entry')
  const again = await createApplicationDocs(APP)
  assert.equal(again.muapDocId, first.muapDocId, 'create returns the existing linkage (idempotent)')

  // RSK is created at Stage-4 entry → now there is a pair to regenerate.
  const rskDocId = await ensureRskDoc(APP, {})
  assert.ok(rskDocId)

  const regen = await regenerateApplicationDocs(APP)
  assert.notEqual(regen.muapDocId, first.muapDocId, 'regenerate copies a fresh MUAP doc')
  assert.notEqual(regen.rskDocId, rskDocId, 'regenerate copies a fresh RSK doc (it existed)')

  const linkage = await prisma.docLinkage.findUnique({ where: { applicationId: APP } })
  assert.equal(linkage?.muapDocId, regen.muapDocId, 'the persisted linkage now points to the regenerated pair')
  assert.equal(linkage?.rskDocId, regen.rskDocId)
  const versions = await prisma.documentVersion.findMany({ where: { applicationId: APP } })
  assert.equal(versions.length, 2, 'regenerate checkpoints the superseded MUAP + RSK docs')
  assert.equal(versions.find((v) => v.kind === 'muap')?.sourceDocId, first.muapDocId)
  assert.equal(versions.find((v) => v.kind === 'rsk')?.sourceDocId, rskDocId)
})

test('Batch 3 T7: ensureRskDoc refillIfExists re-fills the RSK (snapshot old, repoint) on re-entry', async () => {
  await createApplicationDocs(APP)
  const firstRsk = await ensureRskDoc(APP, {}) // first Stage-4 entry → create
  assert.ok(firstRsk)

  // Idempotent without the flag (a normal re-mount must NOT replace the RSK).
  assert.equal(await ensureRskDoc(APP, {}), firstRsk, 'idempotent by default')

  // Re-entry after a send-back (MUAP revised) → refill: snapshot the stale RSK + repoint to a fresh copy.
  const refilled = await ensureRskDoc(APP, { refillIfExists: true })
  assert.notEqual(refilled, firstRsk, 'RSK repointed to a fresh copy from the revised MUAP')
  const linkage = await prisma.docLinkage.findUnique({ where: { applicationId: APP } })
  assert.equal(linkage?.rskDocId, refilled)
  const rskVersions = await prisma.documentVersion.findMany({ where: { applicationId: APP, kind: 'rsk' } })
  assert.ok(rskVersions.some((v) => v.sourceDocId === firstRsk), 'the stale RSK is checkpointed in version history (audit preserved)')
})

test('regenerateApplicationDocs creates a MUAP-only linkage when none exists yet (upsert create branch)', async () => {
  const regen = await regenerateApplicationDocs(NONE)
  assert.ok(regen.muapDocId, 'returns a fresh MUAP')
  assert.equal(regen.rskDocId, null, 'no RSK yet (born at Stage-4 entry)')
  const linkage = await prisma.docLinkage.findUnique({ where: { applicationId: NONE } })
  assert.equal(linkage?.muapDocId, regen.muapDocId)
})

test('rollbackApplicationDocVersion snapshots current first, then points the selected kind at a fresh copy of the checkpoint', async () => {
  await prisma.application.create({
    data: {
      id: ROLLBACK,
      nasabahName: 'Rollback Nasabah',
      nasabahType: 'individual',
      phoneNumber: '0812',
      akadType: 'Murabahah',
      requestedPlafond: 100_000_000n,
      requestedTenorMonths: 12,
      purpose: 'modal kerja',
      stage: 3,
      enteredStageAt: new Date(),
      createdBy: 'tester',
      hardGates: { dsr: 0, ltv: 0, kol: 1 },
      financialInputs: {
        netMonthlyIncome: 0,
        existingMonthlyObligations: 0,
        collateralAppraisedValue: 0,
        proposedMonthlyInstallment: null,
        projectedMonthlyProfitShare: null,
      },
      analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '', generated: false },
    },
  })
  const initial = await createApplicationDocs(ROLLBACK)
  const [muapCheckpoint] = (await snapshotApplicationDocs(ROLLBACK, {
    trigger: 'manual',
    label: 'Manual checkpoint',
    createdBy: 'tester',
    createdByName: 'Tester',
  })).filter((v) => v.kind === 'muap')
  const regenerated = await regenerateApplicationDocs(ROLLBACK)

  const rolled = await rollbackApplicationDocVersion(ROLLBACK, muapCheckpoint.id, { createdBy: 'tester', createdByName: 'Tester' })
  assert.notEqual(rolled.muapDocId, initial.muapDocId, 'rollback uses a fresh current copy, not the historical checkpoint doc')
  assert.notEqual(rolled.muapDocId, regenerated.muapDocId, 'rollback replaces the current MUAP linkage')
  assert.equal(rolled.rskDocId, regenerated.rskDocId, 'rollback only changes the selected document kind')

  const currentSnapshot = await prisma.documentVersion.findFirst({
    where: { applicationId: ROLLBACK, kind: 'muap', trigger: 'rollback_current' },
  })
  assert.equal(currentSnapshot?.sourceDocId, regenerated.muapDocId, 'current MUAP was checkpointed before rollback')
})

// N2 (ADR-0018): the MUAP can now be ABSENT (minted only by the explicit Generate). The doc spine must
// TOLERATE absence without an NPE — snapshot skips a missing MUAP, and freeze fails LOUD (clear Bahasa),
// not with a null-reference crash, mirroring the RSK-absent pattern.
test('spine tolerates a MUAP-absent linkage: snapshot skips it, freeze throws the clear Bahasa error (no NPE)', async () => {
  // A linkage with muapDocId NULL (the state between app creation and the explicit Generate MUAP).
  await prisma.docLinkage.create({ data: { applicationId: ABSENT, muapDocId: null, rskDocId: null, templateVersion: 'v1' } })

  // snapshot must NOT crash on the null MUAP — it simply produces no version rows.
  const versions = await snapshotApplicationDocs(ABSENT, { trigger: 'manual', label: 'absent-muap', createdBy: 'tester' })
  assert.equal(versions.length, 0, 'no MUAP + no RSK → nothing snapshotted (graceful skip, not NPE)')

  // freeze must fail LOUD with the clear Bahasa message (audit bug, not a silent crash).
  await assert.rejects(
    () => freezeDecisionDocs(ABSENT, 'approve'),
    /tidak bisa membekukan arsip keputusan: MUAP belum dibuat/i,
    'freeze throws the clear MUAP-belum-dibuat error rather than dereferencing null',
  )
})
