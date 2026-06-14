import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplication, loadApplicationForWrite, saveApplication, ConcurrencyError } from './write'
import { appendHistory } from '@/lib/history'
import { prisma } from '../db'
import type { LoanApplication } from '@/lib/types'

// Integration test (real Postgres, *_test DB only — see scripts/test-integration.sh).
// Proves the Tier 1.2 optimistic-concurrency guard through the ACTUAL saveApplication
// transaction (stronger than the prisma-level spike): two desks load the same version,
// the first save wins, the stale second save is rejected — never silently clobbered.

const ID = 'ITEST-CONCURRENCY-1'
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
  // A committee-conditional approval the nasabah declined: the app is CLOSED. These
  // columns must persist exactly so the audit record distinguishes declined vs disbursed.
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
  assert.equal(fresh?.closedAt?.getTime(), closedAt.getTime())
})

test('saveApplication — a fresh app defaults to applicationStatus active', async () => {
  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.applicationStatus, 'active')
  assert.equal(fresh?.closeReason, null)
  assert.equal(fresh?.conditionalResponse, null)
})

test('saveApplication — amlAttestation round-trips intact (OJK APU-PPT audit integrity)', async () => {
  // A fresh app has no attestation; the column persists null, then a populated record survives.
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
})

test('saveApplication — extractionMismatches round-trip (Batch 6 OCR cross-check), undefined by default', async () => {
  const fresh0 = await loadApplicationForWrite(ID)
  assert.equal(fresh0?.extractionMismatches, undefined, 'no conflicts by default')

  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  const mismatches = {
    'hardGates.kol': { existingValue: '2', ocrValue: '4', provenance: 'ocr_confirmed' as const, docType: 'slik_report', detectedAt: '2026-06-10T00:00:00.000Z' },
  }
  app.extractionMismatches = mismatches
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.deepEqual(fresh?.extractionMismatches, mismatches, 'conflict persists for later human resolution')
})

test('saveApplication — advisoryExtractions round-trip (RM-led OCR-widening, design §3), undefined by default', async () => {
  const fresh0 = await loadApplicationForWrite(ID)
  assert.equal(fresh0?.advisoryExtractions, undefined, 'no advisory extractions by default')

  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  const advisory = {
    omzet: { value: 1_200_000_000, label: 'Omzet / Penjualan', docType: 'laporan_keuangan', detectedAt: '2026-06-11T00:00:00.000Z' },
    pendapatanSpt: {
      value: 50_000_000, label: 'Penghasilan Kena Pajak (SPT)', docType: 'spt_tahunan', detectedAt: '2026-06-11T00:00:00.000Z',
      crossCheck: { against: 'spt_vs_lapkeu', status: 'mismatch' as const, note: 'berbeda material (advisory, bukan blokir)' },
    },
  }
  app.advisoryExtractions = advisory
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.deepEqual(fresh?.advisoryExtractions, advisory, 'advisory extractions + cross-check annotation persist')
})

test('saveApplication — appraisalPath round-trips (Stage-2 Appraisal desk audit), null by default', async () => {
  // The Appraisal desk records the valuation method (internal/KJPP) for audit; the column persists
  // null until recorded, then the recorded path survives a write→read cycle.
  const fresh0 = await loadApplicationForWrite(ID)
  assert.equal(fresh0?.appraisalPath, null)

  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  app.appraisalPath = 'kjpp_short'
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.appraisalPath, 'kjpp_short')
})

test('saveApplication — P3-D structured appraisalRecord round-trips (design §4), null by default', async () => {
  // The Appraisal desk records the STRUCTURED deliverable (path + appraiser figures/metadata). The
  // column persists null until recorded, then the full record survives a write→read cycle. nilaiPasar/
  // nilaiLikuidasi are ADVISORY here (no LTV write) — this test just pins persistence fidelity.
  const fresh0 = await loadApplicationForWrite(ID)
  assert.equal(fresh0?.appraisalRecord, null)

  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  const record = {
    path: 'kjpp_long' as const,
    nilaiPasar: 1_500_000_000,
    nilaiLikuidasi: 1_200_000_000,
    penilai: 'KJPP Surya & Rekan',
    tanggalLaporan: '2026-06-10',
    reportDocId: 'DOC-APPR-1',
  }
  app.appraisalRecord = record
  app.appraisalPath = 'kjpp_long' // back-compat scalar (the gate reads it); set alongside the record
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.deepEqual(fresh?.appraisalRecord, record, 'structured appraisal record persists intact')
  assert.equal(fresh?.appraisalPath, 'kjpp_long', 'scalar stays in sync for the gate')
})

test('saveApplication — P3-D structured amlAttestation round-trips (design §4)', async () => {
  // The structured fields (result/catatan/screenedParties/evidenceDocId) survive a write→read cycle
  // alongside the legacy 4 fields. PII: screenedParties carry names only — no NIK column.
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  const attestation = {
    attestedBy: 'u-001',
    attestedByName: 'Siti Rahma',
    attestedAt: '2026-06-11T05:00:00.000Z',
    statement: 'Initial AML checking (DTTOT/PEP/negative-list) telah dilakukan dan hasilnya PASSED.',
    result: 'hit-cleared' as const,
    catatan: 'Nama cocok DTTOT; diklarifikasi beda orang.',
    screenedParties: [{ nama: 'Budi Santoso', peran: 'pemohon' }, { nama: 'Siti Aminah' }],
    evidenceDocId: 'DOC-AML-1',
  }
  app.amlAttestation = attestation
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.deepEqual(fresh?.amlAttestation, attestation, 'structured attestation persists intact')
})

test('saveApplication — P3-D originType round-trips; null/absent by default', async () => {
  const fresh0 = await loadApplicationForWrite(ID)
  // Serialize maps a null column to undefined (consumers treat absent as 'original').
  assert.equal(fresh0?.originType, undefined)

  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  app.originType = 'review'
  await saveApplication(app)

  const fresh = await loadApplicationForWrite(ID)
  assert.equal(fresh?.originType, 'review')
})

test('saveApplication — 5C+1S analysis (prose + recomputed scores) round-trips (NOT in-memory only)', async () => {
  // Regression guard: analysis IS durably persisted (analysis Json column), contrary to older
  // notes calling it in-memory. saveAnalysisAction recomputes scores server-side then saveApplication
  // writes the whole FiveCSAnalysis; serialize reads it back intact.
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

test('saveApplication — stale concurrent save is rejected (audit-trail integrity)', async () => {
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

test('saveApplication — history is append-only across saves (audit ledger grows, never rebuilt)', async () => {
  const a1 = await loadApplicationForWrite(ID)
  assert.ok(a1)
  appendHistory(a1, { userId: 'u1', userName: 'RM', action: 'first', stage: 1 })
  await saveApplication(a1)

  const a2 = await loadApplicationForWrite(ID)
  assert.ok(a2)
  appendHistory(a2, { userId: 'u2', userName: 'TL', action: 'second', stage: 1 })
  const saved = await saveApplication(a2)

  const rows = await prisma.historyEntry.findMany({
    where: { applicationId: ID },
    orderBy: { seq: 'asc' },
  })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r) => r.seq), [1, 2])
  assert.deepEqual(rows.map((r) => r.action), ['first', 'second'])
  assert.equal(new Set(rows.map((r) => r.id)).size, 2, 'history ids are unique + stable')
  assert.equal(saved.history.length, 2)
})

test('saveApplication — never deletes a committed history row absent from the saved aggregate', async () => {
  // The append-only audit guarantee: even a buggy/short aggregate must not destroy an
  // already-committed audit row. Under the old delete+recreate persistence it vanished.
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

  const rows = await prisma.historyEntry.findMany({ where: { applicationId: ID } })
  assert.equal(rows.length, 1, 'committed history row must survive a save that omits it')
  assert.equal(rows[0].action, 'committed-audit-row')
})
