import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowToLoanApplication, type ApplicationRow, type CheckpointRef } from './serialize'

// Safety-critical read boundary: a Prisma row → the exact LoanApplication shape the UI +
// pure domain fns expect. Guards BigInt→Number, null→undefined, Date passthrough, JSON casts,
// and that newly-added columns (storageKey/sha256/sizeBytes/contentType, version) are mapped.

const now = new Date('2026-05-24T00:00:00.000Z')

function makeRow(): ApplicationRow {
  return {
    id: 'FOS-2026-001',
    version: 3,
    nasabahName: 'Budi',
    nasabahType: 'individual',
    nik: null,
    phoneNumber: '0812',
    whatsappNumber: null,
    namaUsaha: null,
    akadType: 'Murabahah',
    requestedPlafond: BigInt(120_000_000),
    requestedTenorMonths: 12,
    approvedPlafond: BigInt(100_000_000),
    approvedTenorMonths: 12,
    approvedMarginRate: 10,
    extractionSources: null,
    purpose: 'modal kerja',
    incomeSource: null,
    isMarried: null,
    collateralType: null,
    stage: 1,
    assignments: [
      { stage: 1, role: 'AO', userId: 'u1', userName: 'AO1', status: 'in_progress', assignedAt: now, submittedAt: null },
    ],
    enteredStageAt: now,
    createdAt: now,
    createdBy: 'u1',
    hardGates: { dsr: 30, ltv: 50, kol: 1 },
    hardGateViolations: [],
    kolEntered: false,
    financialsAssessed: false,
    stage2LegalApproval: null,
    financialInputs: {
      netMonthlyIncome: 25_000_000,
      existingMonthlyObligations: 0,
      collateralAppraisedValue: 150_000_000,
      proposedMonthlyInstallment: 11_000_000,
      projectedMonthlyProfitShare: null,
    },
    marginRate: 10,
    documents: [
      {
        id: 'd1',
        name: 'KTP',
        docType: 'ktp',
        status: 'uploaded',
        required: true,
        uploadedAt: now,
        uploadedBy: 'u1',
        fileName: 'ktp.pdf',
        legalVerification: null,
        storageKey: 'applications/FOS-2026-001/d1/ktp.pdf',
        sha256: 'abc123',
        sizeBytes: 1234,
        contentType: 'application/pdf',
      },
    ],
    history: [
      { id: 'h1', seq: 1, timestamp: now, userId: 'u1', userName: 'AO1', action: 'Dibuat', stage: 1, reason: null },
    ],
    analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '' },
    riskRecommendation: null,
    riskNote: null,
    komiteVotes: [],
    komiteDecision: null,
    komiteDecisionNote: null,
    muapNarrative: null,
    muapSyncedAt: null,
    rskSyncedAt: null,
    disbursementStatus: null,
    disbursementConditions: null,
    applicationStatus: 'active',
    closeReason: null,
    closedAt: null,
    conditionalResponse: null,
    conversation: [],
    approvalSteps: [],
    // columns present on the row but not read by the mapper (kept for type completeness)
  } as unknown as ApplicationRow
}

// A conversation row (ConversationMessage child). seq is per-(app,surface) monotonic.
function convMsg(surface: 'discussion' | 'assistant', seq: number, role: 'user' | 'assistant', content: string) {
  return { id: `c${surface}${seq}`, applicationId: 'FOS-2026-001', surface, seq, role, content, createdAt: now }
}

test('rowToLoanApplication — BigInt plafond → Number; version passes through', () => {
  const app = rowToLoanApplication(makeRow())
  assert.equal(app.version, 3)
  assert.equal(app.requestedPlafond, 120_000_000)
  assert.equal(typeof app.requestedPlafond, 'number')
  assert.equal(app.approvedPlafond, 100_000_000)
  assert.equal(typeof app.approvedPlafond, 'number')
})

test('rowToLoanApplication — null DB columns become undefined (not null)', () => {
  const app = rowToLoanApplication(makeRow())
  assert.equal(app.nik, undefined)
  assert.equal(app.whatsappNumber, undefined)
  assert.equal(app.history[0].reason, undefined)
})

test('rowToLoanApplication — Dates pass through by identity', () => {
  const app = rowToLoanApplication(makeRow())
  assert.equal(app.enteredStageAt, now)
  assert.equal(app.documents[0].uploadedAt, now)
})

test('rowToLoanApplication — document storage columns (Tier 0.1) are mapped', () => {
  const doc = rowToLoanApplication(makeRow()).documents[0]
  assert.equal(doc.storageKey, 'applications/FOS-2026-001/d1/ktp.pdf')
  assert.equal(doc.sha256, 'abc123')
  assert.equal(doc.sizeBytes, 1234)
  assert.equal(doc.contentType, 'application/pdf')
})

test('rowToLoanApplication — checkpoint ref attaches, else null', () => {
  assert.equal(rowToLoanApplication(makeRow()).decisionCheckpoint, null)
  const cp: CheckpointRef = { id: 'cp1', contentHash: 'deadbeef', decidedAt: now.toISOString(), riskPolicyVersion: 2, riskDsrMaxPct: 40, riskLtvMaxPct: 70, riskKolMax: 1 }
  assert.deepEqual(rowToLoanApplication(makeRow(), cp).decisionCheckpoint, cp)
})

test('rowToLoanApplication — ConversationMessage rows split by surface into the two threads', () => {
  const row = makeRow()
  ;(row as unknown as { conversation: unknown[] }).conversation = [
    convMsg('discussion', 0, 'user', 'd0'),
    convMsg('discussion', 1, 'assistant', 'd1'),
    convMsg('assistant', 0, 'user', 'a0'),
    convMsg('assistant', 1, 'assistant', 'a1'),
  ]
  const app = rowToLoanApplication(row)
  assert.deepEqual(app.aiChatHistory, [
    { role: 'user', content: 'd0', authorId: null, authorName: null, mentions: [] },
    { role: 'assistant', content: 'd1', authorId: null, authorName: null, mentions: [] },
  ])
  assert.deepEqual(app.aiAssistantLog, [
    { role: 'user', content: 'a0' },
    { role: 'assistant', content: 'a1' },
  ])
})

test('rowToLoanApplication — assistant thread is read-windowed to the last 20 messages', () => {
  const row = makeRow()
  // 24 assistant messages (12 turns) — only the last 20 should survive the read window.
  const many = Array.from({ length: 24 }, (_, i) =>
    convMsg('assistant', i, i % 2 === 0 ? 'user' : 'assistant', `m${i}`),
  )
  ;(row as unknown as { conversation: unknown[] }).conversation = many
  const app = rowToLoanApplication(row)
  assert.equal(app.aiAssistantLog?.length, 20)
  assert.equal(app.aiAssistantLog?.[0].content, 'm4') // first 4 dropped
  assert.equal(app.aiAssistantLog?.at(-1)?.content, 'm23')
  // discussion thread stays empty when no discussion rows are present
  assert.deepEqual(app.aiChatHistory, [])
})

test('rowToLoanApplication — amlAttestation: absent JSON column → null', () => {
  const app = rowToLoanApplication(makeRow())
  assert.equal(app.amlAttestation, null)
})

test('rowToLoanApplication — contextMd (P4-A AI "Catatan"): absent column → null', () => {
  // makeRow() omits contextMd → the mapper coalesces to null (no human note yet).
  const app = rowToLoanApplication(makeRow())
  assert.equal(app.contextMd, null)
})

test('rowToLoanApplication — contextMd round-trips the sacred human "Catatan" string intact', () => {
  const note = 'Nasabah minta jadwal angsuran fleksibel saat panen. — RM Siti, 2026.06.11'
  const row = { ...makeRow(), contextMd: note } as unknown as ApplicationRow
  const app = rowToLoanApplication(row)
  assert.equal(app.contextMd, note)
})

test('rowToLoanApplication — amlAttestation JSON column maps intact (attestedAt stays ISO string)', () => {
  const attestation = {
    attestedBy: 'u1',
    attestedByName: 'Siti Rahma (a.n. Superadmin Luthfi)',
    attestedAt: '2026-06-03T05:00:00.000Z',
    statement: 'Initial AML checking (DTTOT/PEP/negative-list) telah dilakukan dan hasilnya PASSED.',
  }
  const row = { ...makeRow(), amlAttestation: attestation } as unknown as ApplicationRow
  const app = rowToLoanApplication(row)
  assert.deepEqual(app.amlAttestation, attestation)
  assert.equal(typeof app.amlAttestation?.attestedAt, 'string')
})
