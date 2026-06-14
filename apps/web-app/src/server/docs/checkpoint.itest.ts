import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { checkpointPdf, freezeDecisionArchive } from './service'
import { ensureBucket, putDocument } from '../storage/s3'
import { createApplication, loadApplicationForWrite } from '../repo/write'
import { prisma } from '../db'
import type { LoanApplication } from '../../lib/types'

// Integration test (real Postgres + real SeaweedFS, *_test DB only — see
// scripts/test-integration.sh). Proves the audit-critical frozen-PDF read path:
// current checkpoints serve from SeaweedFS via the stored key; legacy checkpoints
// (pre-SeaweedFS, inline Bytes) still serve via the fallback.

const APP = 'ITEST-CHECKPOINT-1'
const decidedAt = new Date('2026-05-29T10:00:00.000Z')

function baseRow() {
  return {
    applicationId: APP,
    decision: 'approve',
    decidedAt,
    muapDocId: 'doc-muap',
    rskDocId: 'doc-rsk',
    contentHash: 'hash',
  }
}

let s3Available = false

before(async () => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
  // Each *.itest.ts runs in its own `node --test` worker; SeaweedFS no longer
  // auto-creates a bucket on PutObject, so this file must create it itself rather
  // than racing the bucket creation in documents.itest.ts.
  try {
    await ensureBucket()
    s3Available = true
  } catch (e) {
    console.warn(`[checkpoint.itest] S3 unreachable — skipping object-store path: ${(e as Error).message}`)
  }
})

beforeEach(async () => {
  await prisma.decisionCheckpoint.deleteMany({ where: { applicationId: APP } })
})

after(async () => {
  await prisma.decisionCheckpoint.deleteMany({ where: { applicationId: APP } })
  await prisma.$disconnect()
})

test('checkpointPdf — serves the SeaweedFS object via the stored key', async (t) => {
  if (!s3Available) return t.skip('S3 not reachable')
  const muapBytes = Buffer.from('%PDF-1.7 muap frozen bytes')
  const rskBytes = Buffer.from('%PDF-1.7 rsk frozen bytes')
  const muapKey = `checkpoints/${APP}/${decidedAt.getTime()}-muap.pdf`
  const rskKey = `checkpoints/${APP}/${decidedAt.getTime()}-rsk.pdf`
  await putDocument(muapKey, muapBytes, 'application/pdf')
  await putDocument(rskKey, rskBytes, 'application/pdf')
  await prisma.decisionCheckpoint.create({
    data: { ...baseRow(), muapStorageKey: muapKey, rskStorageKey: rskKey, muapSizeBytes: muapBytes.length, rskSizeBytes: rskBytes.length },
  })

  assert.deepEqual(await checkpointPdf(APP, 'muap'), muapBytes)
  assert.deepEqual(await checkpointPdf(APP, 'rsk'), rskBytes)
})

test('checkpointPdf — falls back to legacy inline Bytes when no storage key', async () => {
  const legacy = Buffer.from('%PDF-1.7 legacy inline bytes')
  await prisma.decisionCheckpoint.create({
    data: { ...baseRow(), muapPdf: new Uint8Array(legacy), rskPdf: new Uint8Array(legacy) },
  })
  assert.deepEqual(await checkpointPdf(APP, 'muap'), legacy)
})

test('checkpointPdf — no checkpoint for the application → null', async () => {
  assert.equal(await checkpointPdf('ITEST-CHECKPOINT-NONE', 'muap'), null)
})

// Batch 3 T6: a freeze FAILURE must be recorded HARD (durable audit entry + ok:false), never the old
// client `.catch(console.warn)` silent swallow. An app with no DocLinkage makes freezeDecisionDocs
// throw BEFORE any Drive call — a fully hermetic way to exercise the failure path (no Drive/S3 needed).
const FREEZE_APP = 'ITEST-FREEZE-FAIL-1'
function makeFreezeApp(): LoanApplication {
  const now = new Date()
  return {
    id: FREEZE_APP, nasabahName: 'N', nasabahType: 'individual', phoneNumber: '0', akadType: 'Murabahah',
    requestedPlafond: 1, requestedTenorMonths: 12, purpose: 'p', stage: 5, assignments: [], enteredStageAt: now,
    createdAt: now, createdBy: 't', hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [], kolEntered: false,
    financialsAssessed: false, stage2LegalApproval: null, komiteDecision: 'approve',
    financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: null },
    marginRate: null, documents: [], history: [],
    analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '', generated: false },
    komiteVotes: [], riskRecommendation: null, aiChatHistory: [],
  }
}

test('freezeDecisionArchive — a freeze failure is recorded hard (audit entry + ok:false), not swallowed', async () => {
  await prisma.application.deleteMany({ where: { id: FREEZE_APP } })
  await createApplication(makeFreezeApp()) // no DocLinkage → freezeDecisionDocs throws "No Docs"

  const result = await freezeDecisionArchive(FREEZE_APP, 'approve', { userId: 'u-cm', name: 'Ketua' })
  assert.equal(result.ok, false, 'failure surfaced, not swallowed')

  const fresh = await loadApplicationForWrite(FREEZE_APP)
  assert.ok(fresh?.history.some((h) => /Arsip beku keputusan Komite GAGAL/.test(h.action)), 'durable audit entry in the OJK trail')

  await prisma.application.deleteMany({ where: { id: FREEZE_APP } })
})
