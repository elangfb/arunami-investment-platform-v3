import 'server-only'
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore'
import type { LoanApplication } from '@/lib/types'
import { computeViolations } from '@/lib/hardGates'
import { getActiveRiskPolicy } from '@/server/config/risk-policy'
import { deriveWorkflowSnapshot } from '@/lib/workflow'
import { getDb } from '@/server/firebase/firestore'
import { appRef, subCol, COL, SUB } from '@/server/firebase/collections'
import { tsFromDate } from '@/server/firebase/timestamps'
import { pad7, assignmentDocId, historyId } from './doc-ids'
import { loadApplicationDoc, latestCheckpoint } from './serialize.firestore'
import { ConcurrencyError } from './errors'

// Firestore implementation of the application write seam — parity with write.prisma.ts. The OJK
// guarantees Postgres enforced with constraints are enforced here with Firestore transactions +
// deterministic doc-ids:
//   - optimistic concurrency: in-tx read of root `version`, compare, throw ConcurrencyError (NOT
//     Firestore's auto-retry-on-contention — the stale loser must deterministically fail).
//   - append-only history: tx.CREATE at history/{pad7(seq)} (a duplicate seq collides → throws),
//     NEVER tx.set (which would silently overwrite a committed audit row on a position shift — #5).
//   - reads-before-writes: a Firestore tx forbids a read after any write, so ALL tx.get() calls
//     (root version, child id-sets, persisted history ids) run BEFORE any tx.update/set/delete/create.

type Fields = Record<string, unknown>

// The application root-doc field map written by BOTH save (tx.update) and create (tx.create). Excludes
// id/createdAt/customerId/version (handled per-path). Nullable fields are written as explicit null;
// since buildLoanApplication coalesces both null AND absent identically, read parity holds either way.
// Exported (with the child-field maps below) so the dev-only Firestore demo seeder (config/
// seed-firestore-demo.ts) writes pre-built seed aggregates through the SAME field maps as the runtime
// seam — there is exactly one place the LoanApplication→Firestore shape is defined.
export function coreAppFields(app: LoanApplication, hardGateViolations: string[]): Fields {
  return {
    nasabahName: app.nasabahName,
    nasabahType: app.nasabahType,
    nik: app.nik ?? null,
    phoneNumber: app.phoneNumber,
    whatsappNumber: app.whatsappNumber ?? null,
    namaUsaha: app.namaUsaha ?? null,
    npwp: app.npwp ?? null,
    nib: app.nib ?? null,
    alamat: app.alamat ?? null,
    bidangUsaha: app.bidangUsaha ?? null,
    extractionExtras: app.extractionExtras ?? null,
    incomeSource: app.incomeSource ?? null,
    isMarried: app.isMarried ?? null,
    akadType: app.akadType,
    requestedPlafond: Number(app.requestedPlafond),
    requestedTenorMonths: app.requestedTenorMonths,
    approvedPlafond: app.approvedPlafond != null ? Number(app.approvedPlafond) : null,
    approvedTenorMonths: app.approvedTenorMonths ?? null,
    approvedMarginRate: app.approvedMarginRate ?? null,
    marginRate: app.marginRate ?? null,
    purpose: app.purpose,
    collateralType: app.collateralType ?? null,
    stage: app.stage,
    enteredStageAt: tsFromDate(app.enteredStageAt),
    createdBy: app.createdBy,
    kolEntered: app.kolEntered,
    financialsAssessed: app.financialsAssessed,
    riskRecommendation: app.riskRecommendation ?? null,
    riskNote: app.riskNote ?? null,
    aiRiskAdvisory: app.aiRiskAdvisory ?? null,
    exploredSources: app.exploredSources ?? null,
    komiteDecision: app.komiteDecision ?? null,
    komiteDecisionNote: app.komiteDecisionNote ?? null,
    muapNarrative: app.muapNarrative ?? null,
    muapSyncedAt: tsFromDate(app.muapSyncedAt ?? null),
    rskSyncedAt: tsFromDate(app.rskSyncedAt ?? null),
    disbursementStatus: app.disbursementStatus ?? null,
    applicationStatus: app.applicationStatus ?? 'active',
    closeReason: app.closeReason ?? null,
    closedAt: tsFromDate(app.closedAt ?? null),
    conditionalResponse: app.conditionalResponse ?? null,
    // Persisted WorkflowSnapshot read-model — written == deriveWorkflowSnapshot(app), atomically.
    workflowSnapshot: deriveWorkflowSnapshot(app),
    hardGates: app.hardGates,
    hardGateViolations, // derived cache, recomputed at the seam (computed before the tx)
    financialInputs: app.financialInputs,
    analysis: app.analysis,
    extractionSources: app.extractionSources ?? null,
    extractionMismatches: app.extractionMismatches ?? null,
    advisoryExtractions: app.advisoryExtractions ?? null,
    stage2LegalApproval: app.stage2LegalApproval ?? null,
    stage2SlikApproval: app.stage2SlikApproval ?? null,
    appraisalPath: app.appraisalPath ?? null,
    appraisalRecord: app.appraisalRecord ?? null,
    originType: app.originType ?? null,
    sourceApplicationId: app.sourceApplicationId ?? null,
    disbursedAt: tsFromDate(app.disbursedAt ?? null),
    contextMd: app.contextMd ?? null,
    mizanDocFolderId: app.mizanDocFolderId ?? null,
    amlAttestation: app.amlAttestation ?? null,
    bureauSummary: app.bureauSummary ?? null,
    disbursementConditions: app.disbursementConditions ?? null,
  }
}

export function docFields(d: LoanApplication['documents'][number]): Fields {
  return {
    id: d.id,
    name: d.name,
    docType: d.docType,
    status: d.status,
    required: d.required,
    uploadedAt: tsFromDate(d.uploadedAt ?? null),
    uploadedBy: d.uploadedBy ?? null,
    fileName: d.fileName ?? null,
    legalVerification: d.legalVerification ?? null,
    legalVerificationReason: d.legalVerificationReason ?? null,
    storageKey: d.storageKey ?? null,
    sha256: d.sha256 ?? null,
    sizeBytes: d.sizeBytes ?? null,
    contentType: d.contentType ?? null,
    extractedText: d.extractedText ?? null,
    extractedAt: tsFromDate(d.extractedAt ?? null),
  }
}

export function assignmentFields(a: LoanApplication['assignments'][number]): Fields {
  return {
    stage: a.stage,
    role: a.role,
    userId: a.userId,
    userName: a.userName,
    status: a.status,
    assignedAt: tsFromDate(a.assignedAt),
    submittedAt: tsFromDate(a.submittedAt ?? null),
  }
}

export function voteFields(v: LoanApplication['komiteVotes'][number]): Fields {
  return {
    userId: v.userId,
    userName: v.userName,
    vote: v.vote,
    comment: v.comment ?? null,
    timestamp: tsFromDate(v.timestamp),
    isEarlyVote: v.isEarlyVote ?? false,
  }
}

export function historyFields(h: LoanApplication['history'][number], seq: number): Fields {
  return {
    id: h.id, // INCOMING id (critique #4) — never recomputed from the array position
    seq,
    timestamp: tsFromDate(h.timestamp),
    userId: h.userId,
    userName: h.userName,
    action: h.action,
    stage: h.stage,
    reason: h.reason ?? null,
  }
}

export async function loadApplicationForWrite(id: string): Promise<LoanApplication | null> {
  const db = getDb()
  const checkpoint = await latestCheckpoint(db, id)
  return loadApplicationDoc(db, id, checkpoint)
}

export async function saveApplication(app: LoanApplication): Promise<LoanApplication> {
  const db = getDb()
  const expectedVersion = app.version ?? 0
  // Recompute the hardGateViolations cache from its source of truth OUTSIDE the tx (it does config
  // I/O); pass the plain string[] into the tx — mirrors write.prisma computing it before $transaction.
  const hardGateViolations = computeViolations(app.hardGates, await getActiveRiskPolicy())

  let customerId: string | null = null

  await db.runTransaction(async (tx: Transaction) => {
    // ── READS (ALL before any write — Firestore forbids read-after-write) ──────────────────────
    const rootSnap = await tx.get(appRef(db, app.id))
    if (!rootSnap.exists) throw new ConcurrencyError() // missing == updateMany count 0 (parity)
    const cur = rootSnap.data() as Fields
    if ((cur.version as number | undefined ?? 0) !== expectedVersion) throw new ConcurrencyError()
    customerId = (cur.customerId as string | null | undefined) ?? null

    const docsSnap = await tx.get(subCol(db, app.id, SUB.documents))
    const assignSnap = await tx.get(subCol(db, app.id, SUB.assignments))
    const votesSnap = await tx.get(subCol(db, app.id, SUB.komiteVotes))
    const histSnap = await tx.get(subCol(db, app.id, SUB.history).select('id'))
    const persistedHistoryIds = new Set(histSnap.docs.map((h) => (h.data().id as string | undefined) ?? h.id))

    // ── WRITES ────────────────────────────────────────────────────────────────────────────────
    // Optimistic version bump (the guard above already proved expectedVersion).
    tx.update(appRef(db, app.id), { ...coreAppFields(app, hardGateViolations), version: expectedVersion + 1, updatedAt: FieldValue.serverTimestamp() })

    // Rebuild the mutable child sets (documents/assignments/komiteVotes): delete-all-then-set-all,
    // exactly like Prisma's deleteMany+create. Within one tx a delete then set of the same ref nets
    // to a set, so re-set ids are fine; removed ids stay deleted.
    for (const d of docsSnap.docs) tx.delete(d.ref)
    for (const d of app.documents) tx.set(subCol(db, app.id, SUB.documents).doc(d.id), docFields(d))

    for (const a of assignSnap.docs) tx.delete(a.ref)
    app.assignments.forEach((a, i) => tx.set(subCol(db, app.id, SUB.assignments).doc(assignmentDocId(a.stage, a.userId, a.assignedAt, i)), assignmentFields(a)))

    for (const v of votesSnap.docs) tx.delete(v.ref)
    for (const v of app.komiteVotes) tx.set(subCol(db, app.id, SUB.komiteVotes).doc(v.userId), voteFields(v)) // docId=userId ⇒ one-vote-per-member

    // Append-only history: insert ONLY entries not yet persisted (by id), at docId=pad7(seq) where
    // seq is the 1-based position in the full ordered history (matches Prisma @@unique[appId,seq]).
    // tx.create (NOT set) so a seq collision THROWS rather than overwriting a committed audit row (#5).
    app.history.forEach((h, i) => {
      if (persistedHistoryIds.has(h.id)) return
      const seq = i + 1
      tx.create(subCol(db, app.id, SUB.history).doc(pad7(seq)), historyFields(h, seq))
    })
  })

  // Dual-write the linked Customer identity (ADR-0020 §2) — OUTSIDE the tx, like write.prisma.
  if (customerId) await mirrorIdentityToCustomer(db, app, customerId)

  const fresh = await loadApplicationForWrite(app.id)
  if (!fresh) throw new Error(`Application ${app.id} vanished after save`)
  return fresh
}

/** Merge the application's non-null identity onto its linked Customer (never clobber a sibling's
 *  value with null) — parity with write.prisma.mirrorIdentityToCustomer. */
async function mirrorIdentityToCustomer(db: Firestore, app: LoanApplication, customerId: string): Promise<void> {
  const isBusiness = app.nasabahType === 'business'
  const data: Fields = {}
  if (app.nik != null) data.nik = app.nik
  if (app.npwp != null) data.npwp = app.npwp
  if (app.nib != null) data.nib = app.nib
  if (app.alamat != null) data.alamat = app.alamat
  if (app.bidangUsaha != null) data.bidangUsaha = app.bidangUsaha
  if (app.phoneNumber != null) data.phoneNumber = app.phoneNumber
  if (app.whatsappNumber != null) data.whatsappNumber = app.whatsappNumber
  if (isBusiness) {
    const namaUsaha = app.namaUsaha ?? app.nasabahName
    if (namaUsaha != null) data.namaUsaha = namaUsaha
  } else {
    if (app.nasabahName != null) data.nama = app.nasabahName
    if (app.isMarried != null) data.isMarried = app.isMarried
    if (app.incomeSource != null) data.incomeSource = app.incomeSource
  }
  if (Object.keys(data).length === 0) return
  data.updatedAt = FieldValue.serverTimestamp()
  await db.collection(COL.customers).doc(customerId).update(data)
}

export async function appendConversationMessages(opts: {
  appId: string
  expectedVersion: number
  surface: 'discussion' | 'assistant'
  messages: Array<{ role: 'user' | 'assistant'; content: string; authorId?: string | null; authorName?: string | null; mentions?: string[] }>
  audit?: { userId: string; userName: string; action: string; stage: number; reason?: string }
}): Promise<LoanApplication> {
  const db = getDb()
  await db.runTransaction(async (tx: Transaction) => {
    // READS
    const rootSnap = await tx.get(appRef(db, opts.appId))
    if (!rootSnap.exists) throw new ConcurrencyError()
    if (((rootSnap.data() as Fields).version as number | undefined ?? 0) !== opts.expectedVersion) throw new ConcurrencyError()

    // Per-(app,surface) max seq via the `seq` FIELD desc (Firestore forbids DESCENDING __name__ key
    // scans, so we cannot order by documentId desc). Needs the (surface ASC, seq DESC) composite in
    // prod (firestore.indexes.json); the emulator runs it without.
    const convCol = subCol(db, opts.appId, SUB.conversation)
    const lastConv = await tx.get(convCol.where('surface', '==', opts.surface).orderBy('seq', 'desc').limit(1))
    let seq = lastConv.empty ? 0 : (lastConv.docs[0].data().seq as number) + 1

    let hseq = 0
    if (opts.audit) {
      const lastHist = await tx.get(subCol(db, opts.appId, SUB.history).orderBy('seq', 'desc').limit(1))
      hseq = (lastHist.empty ? 0 : (lastHist.docs[0].data().seq as number)) + 1
    }

    // WRITES
    tx.update(appRef(db, opts.appId), { version: opts.expectedVersion + 1, updatedAt: FieldValue.serverTimestamp() })
    for (const m of opts.messages) {
      const s = seq++
      tx.create(convCol.doc(`${opts.surface}__${pad7(s)}`), {
        applicationId: opts.appId, // denormalized — MANDATORY for the listUnansweredMentions collection-group query (critique #23)
        surface: opts.surface,
        seq: s,
        role: m.role,
        content: m.content,
        authorId: m.authorId ?? null,
        authorName: m.authorName ?? null,
        mentions: m.mentions ?? [],
        createdAt: FieldValue.serverTimestamp(),
      })
    }
    if (opts.audit) {
      tx.create(subCol(db, opts.appId, SUB.history).doc(pad7(hseq)), {
        id: historyId(hseq, opts.appId),
        seq: hseq,
        timestamp: FieldValue.serverTimestamp(),
        userId: opts.audit.userId,
        userName: opts.audit.userName,
        action: opts.audit.action,
        stage: opts.audit.stage,
        reason: opts.audit.reason ?? null,
      })
    }
  })

  const fresh = await loadApplicationForWrite(opts.appId)
  if (!fresh) throw new Error(`Application ${opts.appId} vanished after conversation append`)
  return fresh
}

export async function createApplication(app: LoanApplication, link?: { customerId?: string | null }): Promise<LoanApplication> {
  const db = getDb()
  const hardGateViolations = computeViolations(app.hardGates, await getActiveRiskPolicy())

  // 500-op tx cap guard (critique #29): a single create writes root + documents + history +
  // assignments. createApplication has NO version to guard a partial, so refuse oversized payloads
  // loudly rather than silently fall back to a non-atomic batch.
  const opCount = 1 + app.documents.length + app.history.length + app.assignments.length
  if (opCount > 450) throw new Error(`createApplication payload too large for one transaction (${opCount} > 450)`)

  await db.runTransaction(async (tx: Transaction) => {
    tx.create(appRef(db, app.id), {
      ...coreAppFields(app, hardGateViolations),
      id: app.id,
      createdAt: tsFromDate(app.createdAt),
      version: 0,
      updatedAt: FieldValue.serverTimestamp(),
      ...(link?.customerId ? { customerId: link.customerId } : {}),
    })
    for (const d of app.documents) tx.set(subCol(db, app.id, SUB.documents).doc(d.id), docFields(d))
    app.history.forEach((h, i) => tx.create(subCol(db, app.id, SUB.history).doc(pad7(i + 1)), historyFields(h, i + 1)))
    app.assignments.forEach((a, i) => tx.set(subCol(db, app.id, SUB.assignments).doc(assignmentDocId(a.stage, a.userId, a.assignedAt, i)), assignmentFields(a)))
  })

  const fresh = await loadApplicationForWrite(app.id)
  if (!fresh) throw new Error(`Application ${app.id} missing after create`)
  return fresh
}
