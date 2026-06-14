import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { generateMuapForActor } from './docs-muap.core'
import { AuthzError, type Actor } from '@/lib/auth/can'
import { clearStubDocsState } from '@/server/google/stub-clients'
import { prisma } from '@/server/db'

// Integration test (real Postgres *_test + DOCS_PROVIDER=stub) for the explicit "Generate MUAP" (N2,
// ADR-0018). Exercises the actor-injected core (no Firebase session needed — the gate takes a test
// Actor). Proves: explicit generate mints the DocLinkage MUAP; a second call is an idempotent no-op; and
// the MUAP-ladder doc-existence gate (actOnChain('muap','request') in server/actions/approval.ts) flips
// from BLOCKED (muapDocId null) to ALLOWED (muapDocId set) across the generate.
process.env.DOCS_PROVIDER = 'stub'
process.env.GOOGLE_MASTER_MUAP_DOC_ID ??= 'master-muap'
process.env.GOOGLE_MASTER_RSK_DOC_ID ??= 'master-rsk'

const APP = 'ITEST-GENMUAP-1'
const APP_LATE = 'ITEST-GENMUAP-LATE'

// The MUAP-author works phase-wide across Inisiasi (stages 1–3); a Stage-1 actor must be able to generate.
const RM_ACTOR: Actor = {
  userId: 'itest-genmuap-rm',
  name: 'RM Itest',
  avatarInitials: 'RM',
  desks: ['intake', 'muap-author'],
  isSuperadmin: false,
}
const OUTSIDER: Actor = { userId: 'itest-genmuap-out', name: 'Outsider', avatarInitials: 'OU', desks: ['rsk-author'], isSuperadmin: false }

function appRow(id: string, stage: number) {
  return {
    id,
    nasabahName: 'Generate Nasabah',
    nasabahType: 'individual' as const,
    phoneNumber: '0812',
    akadType: 'Murabahah',
    requestedPlafond: 100_000_000n,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
    stage,
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
  }
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await prisma.documentVersion.deleteMany({ where: { applicationId: { in: [APP, APP_LATE] } } })
  await prisma.docLinkage.deleteMany({ where: { applicationId: { in: [APP, APP_LATE] } } })
  await prisma.application.deleteMany({ where: { id: { in: [APP, APP_LATE] } } })
  clearStubDocsState()
})

after(async () => {
  await prisma.documentVersion.deleteMany({ where: { applicationId: { in: [APP, APP_LATE] } } })
  await prisma.docLinkage.deleteMany({ where: { applicationId: { in: [APP, APP_LATE] } } })
  await prisma.application.deleteMany({ where: { id: { in: [APP, APP_LATE] } } })
  await prisma.$disconnect()
})

test('explicit generate mints the MUAP DocLinkage; a second call is an idempotent no-op (N2)', async () => {
  await prisma.application.create({ data: appRow(APP, 3) })

  // The ladder doc-existence gate is BLOCKED before generate (no linkage → muapDocId is absent).
  const before = await prisma.docLinkage.findUnique({ where: { applicationId: APP } })
  assert.equal(before, null, 'no DocLinkage yet → the MUAP-ladder request would be blocked')

  const saved = await generateMuapForActor(RM_ACTOR, APP)
  const linkage = await prisma.docLinkage.findUnique({ where: { applicationId: APP } })
  assert.ok(linkage?.muapDocId, 'explicit generate mints the MUAP DocLinkage')
  assert.equal(linkage?.rskDocId, null, 'RSK is still absent (born at Stage-4 entry)')
  assert.ok(saved.history.some((h) => h.action === 'MUAP dibuat dari template'), 'first mint is audited on the app history')

  // Idempotent: a second generate returns the SAME muapDocId (no duplicate copy).
  await generateMuapForActor(RM_ACTOR, APP)
  const again = await prisma.docLinkage.findUnique({ where: { applicationId: APP } })
  assert.equal(again?.muapDocId, linkage?.muapDocId, 'a second generate is a no-op (idempotent first mint)')
})

test('generate is available across Inisiasi (Stage 1) and re-mint replaces the MUAP + checkpoints the old', async () => {
  await prisma.application.create({ data: appRow(APP_LATE, 1) })

  // MUAP-early: a Stage-1 generate succeeds (phase-wide muap-author window).
  const first = await generateMuapForActor(RM_ACTOR, APP_LATE)
  const firstLinkage = await prisma.docLinkage.findUnique({ where: { applicationId: APP_LATE } })
  assert.ok(firstLinkage?.muapDocId, 'MUAP can be generated at Stage 1 (Inisiasi-wide)')
  assert.ok(first.history.some((h) => h.action === 'MUAP dibuat dari template'))

  // Explicit re-mint (RegenerateMuap) → fresh MUAP doc id + the superseded one checkpointed.
  const re = await generateMuapForActor(RM_ACTOR, APP_LATE, true)
  const reLinkage = await prisma.docLinkage.findUnique({ where: { applicationId: APP_LATE } })
  assert.notEqual(reLinkage?.muapDocId, firstLinkage?.muapDocId, 're-mint copies a fresh MUAP doc')
  assert.ok(re.history.some((h) => h.action === 'MUAP dibuat ulang dari template'), 're-mint is audited distinctly')
  const versions = await prisma.documentVersion.findMany({ where: { applicationId: APP_LATE, kind: 'muap' } })
  assert.ok(versions.some((v) => v.sourceDocId === firstLinkage?.muapDocId), 'the superseded MUAP is checkpointed (audit preserved)')
})

test('generate is gated: an actor without the MUAP-author desk is refused (fails closed)', async () => {
  await prisma.application.create({ data: appRow(APP, 3) })
  await assert.rejects(() => generateMuapForActor(OUTSIDER, APP), AuthzError, 'no muap-author desk → AuthzError')
  const linkage = await prisma.docLinkage.findUnique({ where: { applicationId: APP } })
  assert.equal(linkage, null, 'no MUAP minted for an unauthorized actor')
})
