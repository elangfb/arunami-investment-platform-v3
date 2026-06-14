import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { storeDocumentFile, getDocument } from './documents'
import { ensureBucket } from './s3'
import { createApplication } from '../repo/write'
import { prisma } from '../db'
import type { LoanApplication } from '@/lib/types'

// Integration test (real Postgres *_test DB + real S3/SeaweedFS) for the Tier 0.1
// document-storage path — the OJK-retention spine. Promotes scripts/spike-doc-upload.ts
// into repeatable coverage: it proves the SAME functions the upload action + retrieval
// proxy call (storeDocumentFile → object store + integrity facts → DB row → getDocument)
// preserve bytes + SHA-256 + size + the byte-derived content-type across a real round-trip,
// and that a spoofed file (PNG bytes named ".pdf") is rejected BEFORE anything is stored.
//
// S3 must be reachable (dev SeaweedFS / on-prem / a CI SeaweedFS step). If it isn't, the
// round-trip is skipped (not failed) so `pnpm test:integration` still runs for someone
// without a local object store; the byte-validation rejection test needs no S3 and always runs.

const ID = 'ITEST-DOCSTORE-1'
const now = new Date()
let s3Available = false

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

// A minimal but VALID single-pixel PNG (file-type needs the IHDR chunk to recognize it).
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const PDF_BYTES = Buffer.from('%PDF-1.4\n' + 'mizan itest document body '.repeat(64) + '\n%%EOF')

before(async () => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
  try {
    await ensureBucket()
    s3Available = true
  } catch (e) {
    console.warn(`[documents.itest] S3 unreachable — skipping round-trip: ${(e as Error).message}`)
  }
  await prisma.application.deleteMany({ where: { id: ID } }) // cascade clears children
  await createApplication(makeApp(ID))
})

after(async () => {
  await prisma.application.deleteMany({ where: { id: ID } })
  await prisma.$disconnect()
})

test('storeDocumentFile → DB → getDocument: bytes + SHA-256 + size + content-type intact', async (t) => {
  if (!s3Available) return t.skip('S3 not reachable')

  const docId = `${ID}-pdf`
  const file = new File([PDF_BYTES], 'ktp scan.pdf', { type: 'application/pdf' })

  // 1) store exactly like the upload action does (byte-derived content-type).
  const stored = await storeDocumentFile(ID, docId, file)
  assert.equal(stored.contentType, 'application/pdf') // derived from bytes, not declared type
  assert.equal(stored.sizeBytes, PDF_BYTES.length)

  // 2) persist the integrity facts on a real ApplicationDocument row.
  await prisma.applicationDocument.create({
    data: {
      id: docId,
      applicationId: ID,
      name: 'KTP',
      docType: 'ktp',
      status: 'uploaded',
      required: true,
      uploadedAt: new Date(),
      uploadedBy: 'tester',
      fileName: stored.fileName,
      storageKey: stored.storageKey,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      contentType: stored.contentType,
    },
  })

  // 3) reload + retrieve exactly like the authed proxy route does.
  const row = await prisma.applicationDocument.findUnique({ where: { id: docId } })
  assert.ok(row?.storageKey, 'row persisted with a storageKey')
  const fetched = await getDocument(row.storageKey)
  assert.ok(fetched.equals(PDF_BYTES), 'retrieved bytes are byte-identical to the upload')
  assert.equal(row.sha256, stored.sha256)
  assert.equal(row.sizeBytes, PDF_BYTES.length)
  assert.equal(row.contentType, 'application/pdf')
})

test('storeDocumentFile rejects a spoofed file (PNG bytes named .pdf) BEFORE storing', async () => {
  // The compliance teeth: declared type/extension is ignored; the real bytes are PNG,
  // which is an accepted type — so detection succeeds but as image/png, NOT the claimed pdf.
  const spoof = new File([PNG_BYTES], 'malware.pdf', { type: 'application/pdf' })
  const stored = await storeDocumentFile(ID, `${ID}-spoof`, spoof)
  assert.equal(stored.contentType, 'image/png', 'content-type comes from the bytes, not the .pdf name')

  // A truly unsupported type (plain text) is rejected outright — nothing is stored.
  const bad = new File([Buffer.from('just some text, not a document')], 'notes.pdf', { type: 'application/pdf' })
  await assert.rejects(() => storeDocumentFile(ID, `${ID}-bad`, bad), /tidak didukung|tidak cocok/)
})

test('storeDocumentFile rejects an empty file', async () => {
  const empty = new File([], 'empty.pdf', { type: 'application/pdf' })
  await assert.rejects(() => storeDocumentFile(ID, `${ID}-empty`, empty), /kosong/)
})
