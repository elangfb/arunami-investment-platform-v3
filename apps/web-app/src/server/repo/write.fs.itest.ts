import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { FieldPath } from 'firebase-admin/firestore'
import { createApplication, loadApplicationForWrite, saveApplication, appendConversationMessages, ConcurrencyError } from './write'
import { appendHistory } from '@/lib/history'
import { getDb } from '@/server/firebase/firestore'
import { appRef, subCol, SUB } from '@/server/firebase/collections'
import type { LoanApplication } from '@/lib/types'

// Firestore integration test (real Firestore EMULATOR only — see scripts/test-integration-firestore.sh).
// Proves the Firestore write seam preserves the OJK guarantees Postgres enforced with constraints:
// optimistic-concurrency version guard, append-only history (tx.create, never overwrite), and the
// JSON-aggregate / null-vs-undefined round-trip parity with the Prisma seam.

const ID = 'FS-ITEST-CONCURRENCY-1'
const now = new Date()

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

async function wipe(id: string): Promise<void> {
  await getDb().recursiveDelete(appRef(getDb(), id))
}

before(() => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore itests require the emulator (FIRESTORE_EMULATOR_HOST). Run via scripts/test-integration-firestore.sh')
})

beforeEach(async () => {
  await wipe(ID)
  await createApplication(makeApp(ID))
})

after(async () => {
  await wipe(ID)
})

test('saveApplication — bumps version and persists the change', async () => {
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  assert.equal(app.version, 0)
  app.riskNote = 'updated once'
  const saved = await saveApplication(app)
  assert.equal(saved.version, 1)
  assert.equal(saved.riskNote, 'updated once')
})

test('saveApplication — terminal-closure fields round-trip (audit-trail integrity)', async () => {
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  app.komiteDecision = 'conditional'
  app.conditionalResponse = 'declined'
  app.applicationStatus = 'closed'
  app.closeReason = 'nasabah-decline'
  const closedAt = new Date('2026-05-29T00:00:00.000Z')
  app.closedAt = closedAt
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.applicationStatus, 'closed')
  assert.equal(fresh?.closeReason, 'nasabah-decline')
  assert.equal(fresh?.conditionalResponse, 'declined')
  assert.equal(fresh?.closedAt?.getTime(), closedAt.getTime()) // Timestamp→Date round-trip
})

test('saveApplication — a fresh app defaults to applicationStatus active; optionals null/undefined', async () => {
  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.applicationStatus, 'active')
  assert.equal(fresh?.closeReason, null)
  assert.equal(fresh?.conditionalResponse, null)
  assert.equal(fresh?.originType, undefined) // ?? undefined set (parity with Prisma null→undefined)
  assert.equal(fresh?.extractionMismatches, undefined)
})

test('saveApplication — amlAttestation round-trips intact, ISO date stays a STRING (critique #27)', async () => {
  const fresh0 = await loadApplicationForWrite(ID)
  assert.equal(fresh0?.amlAttestation, null)

  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  const attestation = {
    attestedBy: 'u-001',
    attestedByName: 'Siti Rahma',
    attestedAt: '2026-06-03T05:00:00.000Z',
    statement: 'Initial AML checking (DTTOT/PEP/negative-list) telah dilakukan dan hasilnya PASSED.',
  }
  app.amlAttestation = attestation
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.deepEqual(fresh?.amlAttestation, attestation)
  assert.equal(typeof fresh?.amlAttestation?.attestedAt, 'string', 'embedded ISO timestamp must NOT become a Timestamp')
})

test('saveApplication — 5C+1S analysis (prose + recomputed scores) round-trips', async () => {
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  app.analysis = {
    character: 'Karakter baik', capacity: 'DSR sehat', capital: 'Modal memadai',
    condition: 'Industri stabil', collateral: 'Agunan cukup', syariah: 'Sesuai akad',
    generated: true,
    scores: { character: 80, capacity: 75, capital: 70, condition: 65, collateral: 60, syariah: 90 },
  }
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.analysis.character, 'Karakter baik')
  assert.equal(fresh?.analysis.generated, true)
  assert.deepEqual(fresh?.analysis.scores, { character: 80, capacity: 75, capital: 70, condition: 65, collateral: 60, syariah: 90 })
})

test('saveApplication — stale concurrent save is rejected with ConcurrencyError (OJK audit integrity)', async () => {
  const a = await loadApplicationForWrite(ID)
  const b = await loadApplicationForWrite(ID) // same loaded version as a
  assert.ok(a && b)

  a.riskNote = 'A wins'
  await saveApplication(a) // version 0 → 1

  b.riskNote = 'B loses'
  await assert.rejects(() => saveApplication(b), ConcurrencyError) // b still expects version 0

  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.riskNote, 'A wins') // B's write never landed
  assert.equal(fresh?.version, 1) // advanced exactly once
})

test('saveApplication — history is append-only across saves (ledger grows, never rebuilt)', async () => {
  const a1 = await loadApplicationForWrite(ID)
  assert.ok(a1)
  appendHistory(a1, { userId: 'u1', userName: 'RM', action: 'first', stage: 1 })
  await saveApplication(a1)

  const a2 = await loadApplicationForWrite(ID)
  assert.ok(a2)
  appendHistory(a2, { userId: 'u2', userName: 'TL', action: 'second', stage: 1 })
  const saved = await saveApplication(a2)

  const rows = await subCol(getDb(), ID, SUB.history).orderBy(FieldPath.documentId()).get()
  const data = rows.docs.map((d) => d.data())
  assert.equal(data.length, 2)
  assert.deepEqual(data.map((r) => r.seq), [1, 2])
  assert.deepEqual(data.map((r) => r.action), ['first', 'second'])
  assert.equal(new Set(data.map((r) => r.id)).size, 2, 'history ids are unique + stable')
  assert.equal(saved.history.length, 2)
})

test('saveApplication — never deletes a committed history row absent from the saved aggregate (#5)', async () => {
  const a1 = await loadApplicationForWrite(ID)
  assert.ok(a1)
  appendHistory(a1, { userId: 'u1', userName: 'RM', action: 'committed-audit-row', stage: 1 })
  await saveApplication(a1)

  const a2 = await loadApplicationForWrite(ID)
  assert.ok(a2)
  assert.equal(a2.history.length, 1)
  a2.history = [] // simulate the aggregate forgetting a committed entry
  a2.riskNote = 'unrelated field write still goes through'
  await saveApplication(a2)

  const rows = await subCol(getDb(), ID, SUB.history).get()
  assert.equal(rows.size, 1, 'committed history row must survive a save that omits it')
  assert.equal(rows.docs[0].data().action, 'committed-audit-row')
})

test('appendConversationMessages — per-surface seq + version bump; assistant adds no history', async () => {
  const a = await loadApplicationForWrite(ID)
  assert.ok(a)
  const r1 = await appendConversationMessages({
    appId: ID, expectedVersion: a.version ?? 0, surface: 'assistant',
    messages: [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }],
  })
  assert.equal(r1.version, 1)
  assert.deepEqual((r1.aiAssistantLog ?? []).map((m) => m.content), ['q1', 'a1'])

  const r2 = await appendConversationMessages({
    appId: ID, expectedVersion: r1.version, surface: 'assistant',
    messages: [{ role: 'user', content: 'q2' }],
  })
  assert.equal(r2.version, 2)
  assert.deepEqual((r2.aiAssistantLog ?? []).map((m) => m.content), ['q1', 'a1', 'q2'])

  // assistant surface writes NO history audit row
  const hist = await subCol(getDb(), ID, SUB.history).get()
  assert.equal(hist.size, 0)
})

test('komiteVotes — one doc per member (docId = userId), round-trips', async () => {
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  app.komiteVotes = [
    { userId: 'k1', userName: 'Komite A', vote: 'approve', timestamp: new Date('2026-06-12T00:00:00Z'), isEarlyVote: false },
    { userId: 'k2', userName: 'Komite B', vote: 'conditional', comment: 'syarat', timestamp: new Date('2026-06-12T01:00:00Z'), isEarlyVote: false },
  ]
  await saveApplication(app)

  const votes = await subCol(getDb(), ID, SUB.komiteVotes).get()
  assert.deepEqual(votes.docs.map((d) => d.id).sort(), ['k1', 'k2']) // docId == userId
  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.komiteVotes.length, 2)
})
