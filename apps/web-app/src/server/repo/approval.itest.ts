import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplication, loadApplicationForWrite, saveApplication, ConcurrencyError } from './write'
import { appendApprovalStep, loadApprovalSteps, verifyQrToken } from './approval'
import { isChainComplete, nextApprover } from '@/lib/approval-chain'
import { CHAIN_COMPLETE_ADVANCE } from '@/lib/stage-action'
import { dispatch } from '@/lib/workflow-engine'
import type { Actor } from '@/lib/auth/can'
import { prisma } from '../db'
import type { LoanApplication } from '@/lib/types'

// Integration test (real Postgres, *_test DB only). Proves the ApprovalStep ledger is
// append-only, version-guarded (atomic with the snapshot), and mints a QR token per signature.

const ID = 'ITEST-APPROVAL-1'
const now = new Date()
const sysActor: Actor = { userId: 'sys', name: 'system', avatarInitials: 'S', desks: [], isSuperadmin: true }

function makeApp(id: string): LoanApplication {
  return {
    id,
    nasabahName: 'Test Nasabah',
    nasabahType: 'individual',
    phoneNumber: '0812',
    akadType: 'Murabahah',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
    stage: 1,
    assignments: [],
    enteredStageAt: now,
    createdAt: now,
    createdBy: 'tester',
    hardGates: { dsr: 0, ltv: 0, kol: 1 },
    hardGateViolations: [],
    kolEntered: false,
    financialsAssessed: false,
    stage2LegalApproval: null,
    financialInputs: {
      netMonthlyIncome: 0,
      existingMonthlyObligations: 0,
      collateralAppraisedValue: 0,
      proposedMonthlyInstallment: null,
      projectedMonthlyProfitShare: null,
    },
    marginRate: null,
    documents: [],
    history: [],
    analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '', generated: false },
    komiteVotes: [],
    riskRecommendation: null,
    aiChatHistory: [],
  }
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await prisma.application.deleteMany({ where: { id: ID } }) // cascade clears children
  await createApplication(makeApp(ID))
})

after(async () => {
  await prisma.application.deleteMany({ where: { id: ID } })
  await prisma.$disconnect()
})

// Drive the full MUAP ladder through the repo, asserting the reducer sees each persisted step.
async function nextVersion(): Promise<number> {
  const a = await loadApplicationForWrite(ID)
  assert.ok(a)
  return a.version ?? 0
}

test('appendApprovalStep — drives the MUAP ladder; the maker request AND each approve mint a QR', async () => {
  await appendApprovalStep({
    appId: ID, expectedVersion: await nextVersion(), chain: 'muap', role: 'muap-author',
    action: 'request', userId: 'rm', userName: 'RM', audit: { action: 'Ajukan MUAP', stage: 1 },
  })
  let ledger = await loadApprovalSteps(ID, 'muap')
  assert.equal(nextApprover('muap', ledger), 'muap-approve-tl')
  // Batch 2: the maker's `request` IS the pengaju's signature → it mints a QR (slot tanggal_ttd_rm).
  assert.ok(ledger[0].qrToken && ledger[0].qrToken.length >= 20, 'the maker request row carries a QR (maker signature)')

  await appendApprovalStep({
    appId: ID, expectedVersion: await nextVersion(), chain: 'muap', role: 'muap-approve-tl',
    action: 'approve', userId: 'tl', userName: 'TL', audit: { action: 'Setujui MUAP (TL)', stage: 1 },
  })

  ledger = await loadApprovalSteps(ID, 'muap')
  assert.equal(ledger.length, 2)
  assert.equal(isChainComplete('muap', ledger), true, 'the single TL approve completes the shortened ladder')
  const approveRows = ledger.filter((s) => s.action === 'approve')
  assert.equal(approveRows.length, 1)
  for (const r of approveRows) assert.ok(r.qrToken && r.qrToken.length >= 20, 'each approve row has an unguessable QR token')
  // QR tokens are unique per signature (maker request vs TL approve)
  assert.equal(new Set(ledger.map((r) => r.qrToken)).size, 2)
})

test('appendApprovalStep — is append-only: a reject + re-request keeps every prior row', async () => {
  await appendApprovalStep({
    appId: ID, expectedVersion: await nextVersion(), chain: 'rsk', role: 'rsk-author',
    action: 'request', userId: 'ra', userName: 'RA', audit: { action: 'Ajukan RSK', stage: 2 },
  })
  await appendApprovalStep({
    appId: ID, expectedVersion: await nextVersion(), chain: 'rsk', role: 'rsk-approve-rtl',
    action: 'reject', userId: 'rtl', userName: 'RTL', reason: 'Agunan kurang', audit: { action: 'Kembalikan RSK', stage: 2 },
  })
  await appendApprovalStep({
    appId: ID, expectedVersion: await nextVersion(), chain: 'rsk', role: 'rsk-author',
    action: 'request', userId: 'ra', userName: 'RA', audit: { action: 'Ajukan ulang RSK', stage: 2 },
  })

  const ledger = await loadApprovalSteps(ID, 'rsk')
  assert.equal(ledger.length, 3, 'reject + re-request appended, nothing overwritten')
  assert.deepEqual(ledger.map((s) => s.action), ['request', 'reject', 'request'])
  assert.equal(ledger[1].reason, 'Agunan kurang')
  // Batch 2: both maker requests mint a QR (signature); the reject mints none; the re-request signs afresh.
  assert.ok(ledger[0].qrToken, 'first maker request carries a QR')
  assert.equal(ledger[1].qrToken, null, 'a reject is not a signature → no QR')
  assert.ok(ledger[2].qrToken, 're-request re-signs the resubmission')
  assert.notEqual(ledger[0].qrToken, ledger[2].qrToken, 'fresh token per signature')
  // After re-request the chain is freshly awaiting the RTL checker again.
  assert.equal(nextApprover('rsk', ledger), 'rsk-approve-rtl')
})

test('appendApprovalStep — stale version is rejected (no interleaving with workflow writes)', async () => {
  const stale = await nextVersion() // capture, then advance the version underneath it
  await appendApprovalStep({
    appId: ID, expectedVersion: stale, chain: 'muap', role: 'muap-author',
    action: 'request', userId: 'rm', userName: 'RM', audit: { action: 'Ajukan MUAP', stage: 1 },
  })
  await assert.rejects(
    () => appendApprovalStep({
      appId: ID, expectedVersion: stale, chain: 'muap', role: 'muap-approve-tl',
      action: 'approve', userId: 'tl', userName: 'TL', audit: { action: 'Setujui MUAP (TL)', stage: 1 },
    }),
    ConcurrencyError,
  )
})

test('completing the MUAP ladder advances the application to Risk Review (stage 4)', async () => {
  // The maker-checker gate: a FINAL MUAP (full ladder) carries the app forward — exactly what
  // approveStepAction applies on the last approve. Drive the ladder, then apply the advance.
  await prisma.application.update({ where: { id: ID }, data: { stage: 3 } })
  const v = async () => (await loadApplicationForWrite(ID))!.version ?? 0
  await appendApprovalStep({ appId: ID, expectedVersion: await v(), chain: 'muap', role: 'muap-author', action: 'request', userId: 'rm', userName: 'RM', audit: { action: 'Ajukan MUAP', stage: 3 } })
  await appendApprovalStep({ appId: ID, expectedVersion: await v(), chain: 'muap', role: 'muap-approve-tl', action: 'approve', userId: 'tl', userName: 'TL', audit: { action: 'Setujui MUAP (TL)', stage: 3 } })

  const ledger = await loadApprovalSteps(ID, 'muap')
  assert.equal(isChainComplete('muap', ledger), true)

  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  const advance = CHAIN_COMPLETE_ADVANCE['muap']
  assert.equal(app.stage, advance.from, 'precondition: at the MUAP gate stage')
  dispatch(app, { kind: 'SystemTransition', transition: advance.config }, sysActor)
  const saved = await saveApplication(app)
  assert.equal(saved.stage, 4, 'final MUAP advances into Risk Review')
})

test('appendApprovalStep — drives the SP3 single-reviewer ladder; persists under chain=sp3, completes on one Legal approve', async () => {
  // N1 (docs/designs/rm-led-pipeline-redesign.md §4): the SP3 Legal-review chain rides the SAME
  // ApprovalStep ledger primitive as MUAP/RSK — request (RM) → one Legal approve = complete.
  await appendApprovalStep({
    appId: ID, expectedVersion: await nextVersion(), chain: 'sp3', role: 'sp3-author',
    action: 'request', userId: 'rm', userName: 'RM', audit: { action: 'Ajukan SP3', stage: 6 },
  })
  let ledger = await loadApprovalSteps(ID, 'sp3')
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].chain, 'sp3', 'row persisted under chain=sp3')
  assert.equal(nextApprover('sp3', ledger), 'sp3-legal-review', 'awaiting the single Legal reviewer')
  assert.equal(isChainComplete('sp3', ledger), false, 'not complete before the Legal review')

  await appendApprovalStep({
    appId: ID, expectedVersion: await nextVersion(), chain: 'sp3', role: 'sp3-legal-review',
    action: 'approve', userId: 'lg', userName: 'LG', audit: { action: 'Review Legal SP3', stage: 6 },
  })
  ledger = await loadApprovalSteps(ID, 'sp3')
  assert.equal(ledger.length, 2)
  assert.equal(isChainComplete('sp3', ledger), true, 'one Legal approve completes the single-reviewer chain')
  // The sp3 ledger is isolated from the muap/rsk chains in the same table.
  assert.equal((await loadApprovalSteps(ID, 'muap')).length, 0)
})

test('verifyQrToken — resolves an approve row QR token to the signature + application', async () => {
  await appendApprovalStep({ appId: ID, expectedVersion: (await loadApplicationForWrite(ID))!.version ?? 0, chain: 'muap', role: 'muap-author', action: 'request', userId: 'rm', userName: 'RM', audit: { action: 'Ajukan MUAP', stage: 3 } })
  await appendApprovalStep({ appId: ID, expectedVersion: (await loadApplicationForWrite(ID))!.version ?? 0, chain: 'muap', role: 'muap-approve-tl', action: 'approve', userId: 'tl', userName: 'Teguh', audit: { action: 'Setujui MUAP (TL)', stage: 3 } })

  const ledger = await loadApprovalSteps(ID, 'muap')
  const tlStep = ledger.find((s) => s.role === 'muap-approve-tl' && s.action === 'approve')
  assert.ok(tlStep?.qrToken, 'the approve row minted a QR token')

  const v = await verifyQrToken(tlStep.qrToken)
  assert.ok(v, 'a known token resolves')
  assert.equal(v.step.userName, 'Teguh')
  assert.equal(v.step.role, 'muap-approve-tl')
  assert.equal(v.step.action, 'approve')
  assert.equal(v.applicationId, ID)

  assert.equal(await verifyQrToken('this-token-does-not-exist'), null, 'an unknown token does not resolve')
})
