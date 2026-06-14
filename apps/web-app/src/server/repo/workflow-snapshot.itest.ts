import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplication, loadApplicationForWrite, saveApplication } from './write'
import { deriveWorkflowSnapshot } from '@/lib/workflow'
import { prisma } from '../db'
import type { LoanApplication } from '@/lib/types'

// Integration (real Postgres, *_test DB only): ADR-0004 §3 Phase 3a — the WorkflowSnapshot is
// PERSISTED at the write seam, atomically with the row, and stays == deriveWorkflowSnapshot(app).
// `stage` remains the SSOT (the authority inversion + reader migration are Phase 3b, deferred).

const ID = 'ITEST-WF-SNAPSHOT-1'
const now = new Date()

function makeApp(id: string, stage: LoanApplication['stage']): LoanApplication {
  return {
    id,
    nasabahName: 'Test Nasabah',
    nasabahType: 'individual',
    phoneNumber: '0812',
    akadType: 'Murabahah',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
    stage,
    assignments: [],
    enteredStageAt: now,
    createdAt: now,
    createdBy: 'tester',
    hardGates: { dsr: 0, ltv: 0, kol: 1 },
    hardGateViolations: [],
    kolEntered: false,
    financialsAssessed: false,
    stage2LegalApproval: null,
    financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: null },
    marginRate: null,
    documents: [],
    history: [],
    analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '', generated: false },
    komiteVotes: [],
    riskRecommendation: null,
    aiChatHistory: [],
  }
}

async function rawSnapshot(id: string): Promise<unknown> {
  const row = await prisma.application.findUnique({ where: { id }, select: { workflowSnapshot: true } })
  return row?.workflowSnapshot ?? null
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})
beforeEach(async () => {
  await prisma.application.deleteMany({ where: { id: ID } })
})
after(async () => {
  await prisma.application.deleteMany({ where: { id: ID } })
})

test('createApplication persists the snapshot == derived (intake / Inisiasi / active)', async () => {
  await createApplication(makeApp(ID, 1))
  assert.deepEqual(await rawSnapshot(ID), { phase: 1, step: 'intake', status: 'active', closeReason: null })
  const reloaded = await loadApplicationForWrite(ID)
  assert.ok(reloaded)
  assert.deepEqual(reloaded.workflowSnapshot, deriveWorkflowSnapshot(reloaded))
})

test('saveApplication re-persists the snapshot on a stage change (atomic, == derived)', async () => {
  await createApplication(makeApp(ID, 1))
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  app.stage = 4 // Risk Review
  await saveApplication(app)
  assert.deepEqual(await rawSnapshot(ID), { phase: 2, step: 'risk', status: 'active', closeReason: null })
  const reloaded = await loadApplicationForWrite(ID)
  assert.ok(reloaded)
  assert.deepEqual(reloaded.workflowSnapshot, deriveWorkflowSnapshot(reloaded))
})

test('snapshot carries closed status + closeReason on a terminal close', async () => {
  await createApplication(makeApp(ID, 5))
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  app.applicationStatus = 'closed'
  app.closeReason = 'committee-reject'
  await saveApplication(app)
  assert.deepEqual(await rawSnapshot(ID), { phase: 3, step: 'komite', status: 'closed', closeReason: 'committee-reject' })
})

test('serialize re-derives when the column is null (pre-migration row never reads as undefined)', async () => {
  await createApplication(makeApp(ID, 2))
  // Simulate a pre-migration row: null the persisted column out-of-band.
  await prisma.$executeRawUnsafe('UPDATE "Application" SET "workflowSnapshot" = NULL WHERE id = $1', ID)
  const reloaded = await loadApplicationForWrite(ID)
  assert.ok(reloaded)
  assert.deepEqual(reloaded.workflowSnapshot, { phase: 1, step: 'legal-slik', status: 'active', closeReason: null }, 'derived on null column')
})
