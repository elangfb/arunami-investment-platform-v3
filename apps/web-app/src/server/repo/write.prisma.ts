import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import type { LoanApplication } from '@/lib/types'
import { computeViolations } from '@/lib/hardGates'
import { getActiveRiskPolicy } from '@/server/config/risk-policy'
import { APPLICATION_INCLUDE, rowToLoanApplication, CHECKPOINT_SELECT, toCheckpointRef } from './serialize'
import { deriveWorkflowSnapshot } from '@/lib/workflow'
import { ConcurrencyError } from './errors'

// Prisma (PostgreSQL) implementation of the application write seam. Selected by the ./write
// dispatcher when DATA_BACKEND=prisma|dual. The Firestore sibling lives in ./write.firestore.

// Named interfaces (HardGates, FiveCSAnalysis) lack the implicit index signature
// Prisma's InputJsonValue requires; cast at the write boundary.
const json = (v: unknown) => v as Prisma.InputJsonValue
const jsonOrNull = (v: unknown) => (v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue))

/// Non-cached load for write paths (getApplication is cache()'d — unsafe to call
/// twice around a mutation in one request).
export async function loadApplicationForWrite(id: string): Promise<LoanApplication | null> {
  const row = await prisma.application.findUnique({ where: { id }, include: APPLICATION_INCLUDE })
  if (!row) return null
  const cp = await prisma.decisionCheckpoint.findFirst({
    where: { applicationId: id },
    orderBy: { createdAt: 'desc' },
    select: CHECKPOINT_SELECT,
  })
  return rowToLoanApplication(row, toCheckpointRef(cp))
}

/// Persist a full LoanApplication aggregate after a pure-fn mutation. Children are
/// append-or-rebuilt deterministically by the domain fns, so we replace them within
/// a transaction, guarded by an optimistic version check (see saveApplication): the
/// version is read at load (loadApplicationForWrite) and bumped only if unchanged,
/// so a concurrent writer cannot silently clobber appended history — the loser gets
/// a ConcurrencyError instead.

/// TODO(test): saveApplication round-trip + version bump — save then loadApplicationForWrite
/// returns the same aggregate with version incremented; the concurrent-save case (two desks
/// loading the same version) must now reject the second save with ConcurrencyError.
export async function saveApplication(app: LoanApplication): Promise<LoanApplication> {
  const expectedVersion = app.version ?? 0
  // Auto-sync the hardGateViolations read-cache from its source of truth (hardGates +
  // active policy) at the single write seam — callers never set it (so it can't drift).
  const hardGateViolations = computeViolations(app.hardGates, await getActiveRiskPolicy())
  await prisma.$transaction(async (tx) => {
    // Optimistic-concurrency guard: bump the version ONLY if no other writer has
    // advanced it since this aggregate was loaded. The mutable child tables
    // (documents/assignments/komiteVotes) are rebuilt by delete+recreate; the
    // append-only audit log (historyEntry) is reconciled insert-only below. The
    // guard makes both atomic so two desks acting on one application cannot clobber.
    const guard = await tx.application.updateMany({
      where: { id: app.id, version: expectedVersion },
      data: { version: { increment: 1 } },
    })
    if (guard.count === 0) throw new ConcurrencyError()

    await tx.applicationDocument.deleteMany({ where: { applicationId: app.id } })
    await tx.stageAssignment.deleteMany({ where: { applicationId: app.id } })
    await tx.komiteVote.deleteMany({ where: { applicationId: app.id } })
    await tx.application.update({
      where: { id: app.id },
      data: {
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
        extractionExtras: app.extractionExtras ?? undefined,
        incomeSource: app.incomeSource ?? null,
        isMarried: app.isMarried ?? null,
        akadType: app.akadType,
        requestedPlafond: BigInt(app.requestedPlafond),
        requestedTenorMonths: app.requestedTenorMonths,
        approvedPlafond: app.approvedPlafond != null ? BigInt(app.approvedPlafond) : null,
        approvedTenorMonths: app.approvedTenorMonths ?? null,
        approvedMarginRate: app.approvedMarginRate ?? null,
        marginRate: app.marginRate ?? null,
        purpose: app.purpose,
        collateralType: app.collateralType ?? null,
        stage: app.stage,
        enteredStageAt: app.enteredStageAt,
        createdBy: app.createdBy,
        kolEntered: app.kolEntered,
        financialsAssessed: app.financialsAssessed,
        riskRecommendation: app.riskRecommendation ?? null,
        riskNote: app.riskNote ?? null,
        aiRiskAdvisory: jsonOrNull(app.aiRiskAdvisory),
        exploredSources: jsonOrNull(app.exploredSources),
        komiteDecision: app.komiteDecision ?? null,
        komiteDecisionNote: app.komiteDecisionNote ?? null,
        muapNarrative: app.muapNarrative ?? null,
        muapSyncedAt: app.muapSyncedAt ?? null,
        rskSyncedAt: app.rskSyncedAt ?? null,
        disbursementStatus: app.disbursementStatus ?? null,
        applicationStatus: app.applicationStatus ?? 'active',
        closeReason: app.closeReason ?? null,
        closedAt: app.closedAt ?? null,
        conditionalResponse: app.conditionalResponse ?? null,
        // Persisted WorkflowSnapshot read-model (ADR-0004 §3 Phase 3a): derived from the just-mutated
        // aggregate so it is written == deriveWorkflowSnapshot(app), atomically with the ledger inserts
        // below (same tx + optimistic version guard). `stage` stays the SSOT.
        workflowSnapshot: json(deriveWorkflowSnapshot(app)),
        hardGates: json(app.hardGates),
        hardGateViolations, // derived cache, recomputed above
        financialInputs: json(app.financialInputs),
        analysis: json(app.analysis),
        // aiChatHistory / aiAssistantLog moved to ConversationMessage (append-managed by
        // appendConversationMessages) — saveApplication no longer rewrites them.
        extractionSources: jsonOrNull(app.extractionSources),
        extractionMismatches: jsonOrNull(app.extractionMismatches),
        advisoryExtractions: jsonOrNull(app.advisoryExtractions),
        stage2LegalApproval: jsonOrNull(app.stage2LegalApproval),
        stage2SlikApproval: jsonOrNull(app.stage2SlikApproval),
        appraisalPath: app.appraisalPath ?? null,
        appraisalRecord: jsonOrNull(app.appraisalRecord), // P3-D structured Penilaian (design §4)
        originType: app.originType ?? null, // P3-D origin tag; null persists, default applied in code
        // P5 (RM-led redesign §7): lineage parent (set once at create) + cadence anchor (set at 'Cair').
        sourceApplicationId: app.sourceApplicationId ?? null,
        disbursedAt: app.disbursedAt ?? null,
        contextMd: app.contextMd ?? null, // P4-A app-scoped AI "Catatan" (design §5); null = no human note
        mizanDocFolderId: app.mizanDocFolderId ?? null, // P4-C (ADR-0019 §4) Mizan-owned generated-doc folder ref
        amlAttestation: jsonOrNull(app.amlAttestation),
        bureauSummary: jsonOrNull(app.bureauSummary),
        disbursementConditions: jsonOrNull(app.disbursementConditions),
        // version bumped by the optimistic guard above (not here).
        documents: {
          create: app.documents.map((d) => ({
            id: d.id,
            name: d.name,
            docType: d.docType,
            status: d.status,
            required: d.required,
            uploadedAt: d.uploadedAt ?? null,
            uploadedBy: d.uploadedBy ?? null,
            fileName: d.fileName ?? null,
            legalVerification: d.legalVerification ?? null,
            legalVerificationReason: d.legalVerificationReason ?? null,
            storageKey: d.storageKey ?? null,
            sha256: d.sha256 ?? null,
            sizeBytes: d.sizeBytes ?? null,
            contentType: d.contentType ?? null,
            extractedText: d.extractedText ?? null,
            extractedAt: d.extractedAt ?? null,
          })),
        },
        assignments: {
          create: app.assignments.map((a) => ({
            stage: a.stage,
            role: a.role,
            userId: a.userId,
            userName: a.userName,
            status: a.status,
            assignedAt: a.assignedAt,
            submittedAt: a.submittedAt ?? null,
          })),
        },
        komiteVotes: {
          create: app.komiteVotes.map((v) => ({
            userId: v.userId,
            userName: v.userName,
            vote: v.vote,
            comment: v.comment ?? null,
            timestamp: v.timestamp,
            isEarlyVote: v.isEarlyVote ?? false,
          })),
        },
      },
    })
    // History is an append-only audit ledger: never delete+recreate it (that would let
    // a single buggy/short aggregate silently destroy committed audit rows). Insert only
    // entries not yet persisted (stable unique ids from appendHistory); seq = 1-based
    // position in the full ordered history (matches @@unique[applicationId, seq]).
    const persistedHistory = await tx.historyEntry.findMany({
      where: { applicationId: app.id },
      select: { id: true },
    })
    const persistedHistoryIds = new Set(persistedHistory.map((h) => h.id))
    const newHistory = app.history
      .map((h, i) => ({ h, seq: i + 1 }))
      .filter(({ h }) => !persistedHistoryIds.has(h.id))
    if (newHistory.length > 0) {
      await tx.historyEntry.createMany({
        data: newHistory.map(({ h, seq }) => ({
          id: h.id,
          applicationId: app.id,
          seq,
          timestamp: h.timestamp,
          userId: h.userId,
          userName: h.userName,
          action: h.action,
          stage: h.stage,
          reason: h.reason ?? null,
        })),
      })
    }
  })

  // Dual-write (ADR-0020 §2): mirror the just-saved identity onto the linked Customer so the
  // OCR-confirm path (confirmExtractedFieldAction → saveApplication) keeps the first-class
  // Customer in sync with the Application's dual-read identity columns. ADDITIVE: the Application
  // stays the read source; we never touch a reader or the version guard. Idempotent (writes the
  // current identity each time); a no-op when the app isn't linked yet (pre-migration rows).
  await mirrorIdentityToCustomer(app)

  const fresh = await loadApplicationForWrite(app.id)
  if (!fresh) throw new Error(`Application ${app.id} vanished after save`)
  return fresh
}

/// Mirror an Application's identity onto its linked Customer (ADR-0020 §2 dual-write on update).
/// Looks up the FK directly (the domain aggregate intentionally does NOT carry customerId — no
/// reader change) and writes the QUERIED identity columns + name/contact. No-op when unlinked.
async function mirrorIdentityToCustomer(app: LoanApplication): Promise<void> {
  const row = await prisma.application.findUnique({ where: { id: app.id }, select: { customerId: true } })
  if (!row?.customerId) return
  const isBusiness = app.nasabahType === 'business'
  // MERGE, never clobber. A Customer can be SHARED by several of a customer's applications — the
  // create path reuses one Customer per NIK/NPWP, so Customer:Application is 1:MANY. Writing every
  // field as `app.x ?? null` would NULL identity that a *sibling* application populated but this
  // one left blank (silent data loss on the shared row). So we only write fields THIS app actually
  // has a value for; a blank field is OMITTED, never written as null. A non-blank value still
  // updates (OCR-confirm corrections propagate). Mirrors the "blessed value never blind-overwritten"
  // rule in lib/extraction-registry.ts. (Conflicting non-blank values = last-writer-wins on the
  // shared row — an accepted P1 limitation; per-app identity divergence is a later concern.)
  const data: Prisma.CustomerUpdateInput = {}
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
  await prisma.customer.update({ where: { id: row.customerId }, data })
}

/// Append one or more messages to a conversation stream (ConversationMessage child table —
/// replaces the former aiChatHistory/aiAssistantLog JSON arrays). Each message is ONE inserted
/// row — no giant-array rewrite, so an unbounded discussion thread no longer bloats the
/// Application row or costs O(n) per post. Still version-guarded (exact concurrency parity with
/// the old saveApplication path): bumping the version makes the optional audit HistoryEntry
/// atomic with concurrent saves, so a parallel saveApplication's history rebuild cannot clobber
/// it. `audit` is set for the team discussion (one HistoryEntry); the risk-assistant passes none
/// (its audit is AiInteraction). seq is per-(app,surface) monotonic; history seq stays per-app.
export async function appendConversationMessages(opts: {
  appId: string
  expectedVersion: number
  surface: 'discussion' | 'assistant'
  messages: Array<{ role: 'user' | 'assistant'; content: string; authorId?: string | null; authorName?: string | null; mentions?: string[] }>
  audit?: { userId: string; userName: string; action: string; stage: number; reason?: string }
}): Promise<LoanApplication> {
  await prisma.$transaction(async (tx) => {
    const guard = await tx.application.updateMany({
      where: { id: opts.appId, version: opts.expectedVersion },
      data: { version: { increment: 1 } },
    })
    if (guard.count === 0) throw new ConcurrencyError()

    const lastMsg = await tx.conversationMessage.findFirst({
      where: { applicationId: opts.appId, surface: opts.surface },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    })
    let seq = (lastMsg?.seq ?? -1) + 1
    await tx.conversationMessage.createMany({
      data: opts.messages.map((m) => ({
        applicationId: opts.appId,
        surface: opts.surface,
        seq: seq++,
        role: m.role,
        content: m.content,
        authorId: m.authorId ?? null,
        authorName: m.authorName ?? null,
        mentions: m.mentions ?? [],
      })),
    })

    if (opts.audit) {
      const lastHist = await tx.historyEntry.findFirst({
        where: { applicationId: opts.appId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      })
      const hseq = (lastHist?.seq ?? 0) + 1
      await tx.historyEntry.create({
        data: {
          id: `h-${String(hseq).padStart(7, '0')}-${opts.appId}`,
          applicationId: opts.appId,
          seq: hseq,
          timestamp: new Date(),
          userId: opts.audit.userId,
          userName: opts.audit.userName,
          action: opts.audit.action,
          stage: opts.audit.stage,
          reason: opts.audit.reason ?? null,
        },
      })
    }
  })

  const fresh = await loadApplicationForWrite(opts.appId)
  if (!fresh) throw new Error(`Application ${opts.appId} vanished after conversation append`)
  return fresh
}

/// Insert a brand-new application aggregate (create flow). Same field mapping as
/// saveApplication but a fresh row (version defaults to 0). `link.customerId` (ADR-0020 §2,
/// ADDITIVE/dual-read) attaches the first-class Customer entity at create — the Application
/// keeps its identity columns and stays the read source; this only sets the FK.
export async function createApplication(app: LoanApplication, link?: { customerId?: string | null }): Promise<LoanApplication> {
  const hardGateViolations = computeViolations(app.hardGates, await getActiveRiskPolicy())
  await prisma.application.create({
    data: {
      id: app.id,
      ...(link?.customerId ? { customerId: link.customerId } : {}),
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
      extractionExtras: app.extractionExtras ?? undefined,
      incomeSource: app.incomeSource ?? null,
      isMarried: app.isMarried ?? null,
      akadType: app.akadType,
      requestedPlafond: BigInt(app.requestedPlafond),
      requestedTenorMonths: app.requestedTenorMonths,
      approvedPlafond: app.approvedPlafond != null ? BigInt(app.approvedPlafond) : null,
      approvedTenorMonths: app.approvedTenorMonths ?? null,
      approvedMarginRate: app.approvedMarginRate ?? null,
      marginRate: app.marginRate ?? null,
      purpose: app.purpose,
      collateralType: app.collateralType ?? null,
      stage: app.stage,
      // Persisted WorkflowSnapshot read-model (ADR-0004 §3 Phase 3a) — written == derived at create.
      workflowSnapshot: json(deriveWorkflowSnapshot(app)),
      enteredStageAt: app.enteredStageAt,
      createdAt: app.createdAt,
      createdBy: app.createdBy,
      kolEntered: app.kolEntered,
      financialsAssessed: app.financialsAssessed,
      hardGates: json(app.hardGates),
      hardGateViolations, // derived cache, recomputed above
      financialInputs: json(app.financialInputs),
      analysis: json(app.analysis),
      // aiChatHistory / aiAssistantLog moved to ConversationMessage — not written here.
      extractionSources: jsonOrNull(app.extractionSources),
      extractionMismatches: jsonOrNull(app.extractionMismatches),
      advisoryExtractions: jsonOrNull(app.advisoryExtractions),
      stage2LegalApproval: jsonOrNull(app.stage2LegalApproval),
      stage2SlikApproval: jsonOrNull(app.stage2SlikApproval),
      appraisalPath: app.appraisalPath ?? null,
      originType: app.originType ?? null, // P3-D origin tag; null = original (default applied in code)
      // P5 (RM-led redesign §7): lineage parent + cadence anchor. A review/adendum child carries
      // sourceApplicationId at create; disbursedAt is null until the facility's 5→6 'Cair' transition.
      sourceApplicationId: app.sourceApplicationId ?? null,
      disbursedAt: app.disbursedAt ?? null,
      amlAttestation: jsonOrNull(app.amlAttestation),
      bureauSummary: jsonOrNull(app.bureauSummary),
      disbursementConditions: jsonOrNull(app.disbursementConditions),
      documents: {
        create: app.documents.map((d) => ({
          id: d.id,
          name: d.name,
          docType: d.docType,
          status: d.status,
          required: d.required,
          uploadedAt: d.uploadedAt ?? null,
          uploadedBy: d.uploadedBy ?? null,
          fileName: d.fileName ?? null,
          legalVerification: d.legalVerification ?? null,
          legalVerificationReason: d.legalVerificationReason ?? null,
          storageKey: d.storageKey ?? null,
          sha256: d.sha256 ?? null,
          sizeBytes: d.sizeBytes ?? null,
          contentType: d.contentType ?? null,
        })),
      },
      history: {
        create: app.history.map((h, i) => ({
          id: h.id,
          seq: i + 1,
          timestamp: h.timestamp,
          userId: h.userId,
          userName: h.userName,
          action: h.action,
          stage: h.stage,
          reason: h.reason ?? null,
        })),
      },
      assignments: {
        create: app.assignments.map((a) => ({
          stage: a.stage,
          role: a.role,
          userId: a.userId,
          userName: a.userName,
          status: a.status,
          assignedAt: a.assignedAt,
          submittedAt: a.submittedAt ?? null,
        })),
      },
    },
  })
  const fresh = await loadApplicationForWrite(app.id)
  if (!fresh) throw new Error(`Application ${app.id} missing after create`)
  return fresh
}
