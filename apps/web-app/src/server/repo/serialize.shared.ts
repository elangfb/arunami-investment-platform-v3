import 'server-only'
import type {
  AdvisoryExtraction,
  AkadType,
  CollateralType,
  DisbursementStatus,
  DocumentStatus,
  ExtractionSource,
  ExtractionMismatch,
  FiveCSAnalysis,
  HardGates,
  HardGateViolation,
  IncomeSource,
  KomiteVoteValue,
  LoanApplication,
  PersonalStatus,
  RiskRecommendation,
  Role,
  Stage,
  WorkflowSnapshot,
} from '@/lib/types'
import type { ApprovalAction, ApprovalChain, ApprovalRole } from '@/lib/approval-chain'
import { deriveWorkflowSnapshot } from '@/lib/workflow'

// BACKEND-AGNOSTIC application assembler. Owns the EXACT null-vs-undefined map + child mapping +
// conversation split that reconstruct the LoanApplication shape the UI + pure domain fns expect.
// Both adapters call buildLoanApplication: serialize.ts (Prisma row) and serialize.firestore.ts
// (docToLoanApplication). The input MUST already be normalized — JS Date (never Timestamp), number
// plafond (bigint tolerated), JSON aggregates as plain objects, children pre-ordered. Forbidding
// Timestamp at this seam means a missed Firestore conversion is a compile error upstream, not silent drift.

// Rolling window the risk-assistant UI shows (former MAX_TURNS=10 turns × 2 messages). Applied at read.
export const ASSISTANT_WINDOW = 20

export interface CheckpointRef {
  id: string
  contentHash: string
  decidedAt: string
  // Frozen risk policy at decision time (DecisionCheckpoint) — for the decision-audit UI. Null =
  // pre-Phase-C checkpoint, or the code default was in effect (no seeded version).
  riskPolicyVersion: number | null
  riskDsrMaxPct: number | null
  riskLtvMaxPct: number | null
  riskKolMax: number | null
}

// Backend-neutral: decidedAt is already a JS Date (Prisma native / toDate()'d from a Timestamp).
export function toCheckpointRef(
  cp: {
    id: string
    contentHash: string
    decidedAt: Date
    riskPolicyVersion: number | null
    riskDsrMaxPct: number | null
    riskLtvMaxPct: number | null
    riskKolMax: number | null
  } | null,
): CheckpointRef | null {
  if (!cp) return null
  return {
    id: cp.id,
    contentHash: cp.contentHash,
    decidedAt: cp.decidedAt.toISOString(),
    riskPolicyVersion: cp.riskPolicyVersion,
    riskDsrMaxPct: cp.riskDsrMaxPct,
    riskLtvMaxPct: cp.riskLtvMaxPct,
    riskKolMax: cp.riskKolMax,
  }
}

// ── Normalized child shapes (Date, never Timestamp). Adapters provide these pre-ordered. ───────
export interface NormalizedDoc {
  id: string
  name: string
  docType: string
  status: string
  required: boolean
  uploadedAt: Date | null
  uploadedBy: string | null
  fileName: string | null
  legalVerification: string | null
  legalVerificationReason: string | null
  storageKey: string | null
  sha256: string | null
  sizeBytes: number | null
  contentType: string | null
  extractedText: string | null
  extractedAt: Date | null
}
export interface NormalizedHistory {
  id: string
  timestamp: Date
  userId: string
  userName: string
  action: string
  stage: number
  reason: string | null
}
export interface NormalizedAssignment {
  stage: number
  role: string
  userId: string
  userName: string
  status: string
  assignedAt: Date
  submittedAt: Date | null
}
export interface NormalizedVote {
  userId: string
  userName: string
  vote: string
  comment: string | null
  timestamp: Date
  isEarlyVote: boolean
}
export interface NormalizedMessage {
  surface: string
  role: string
  content: string
  authorId: string | null
  authorName: string | null
  mentions: string[]
}
export interface NormalizedStep {
  chain: string
  role: string
  action: string
  userId: string
  userName: string
  reason: string | null
  qrToken: string | null
  createdAt: Date
}

// The normalized application aggregate. Mirrors the Prisma Application columns + relations, but with
// JS Date (not Timestamp) and number|bigint plafond. The Prisma row is structurally assignable to it
// (it has these fields + extras); the Firestore adapter constructs it via toDate() conversions.
export interface NormalizedApp {
  id: string
  version: number
  nasabahName: string
  nasabahType: string
  nik: string | null
  phoneNumber: string
  whatsappNumber: string | null
  namaUsaha: string | null
  npwp: string | null
  nib: string | null
  alamat: string | null
  bidangUsaha: string | null
  extractionExtras: unknown
  akadType: string
  requestedPlafond: number | bigint
  requestedTenorMonths: number
  approvedPlafond: number | bigint | null
  approvedTenorMonths: number | null
  approvedMarginRate: number | null
  extractionSources: unknown
  extractionMismatches: unknown
  advisoryExtractions: unknown
  purpose: string
  incomeSource: string | null
  isMarried: boolean | null
  collateralType: string | null
  stage: number
  workflowSnapshot: unknown
  applicationStatus: string | null
  closeReason: string | null
  enteredStageAt: Date
  createdAt: Date
  createdBy: string
  hardGates: unknown
  hardGateViolations: unknown
  kolEntered: boolean
  financialsAssessed: boolean
  stage2LegalApproval: unknown
  stage2SlikApproval: unknown
  appraisalPath: unknown
  appraisalRecord: unknown
  originType: unknown
  sourceApplicationId: string | null
  disbursedAt: Date | null
  contextMd: string | null
  mizanDocFolderId: string | null
  amlAttestation: unknown
  bureauSummary: unknown
  financialInputs: unknown
  marginRate: number | null
  analysis: unknown
  riskRecommendation: string | null
  riskNote: string | null
  aiRiskAdvisory: unknown
  exploredSources: unknown
  komiteDecision: string | null
  komiteDecisionNote: string | null
  muapNarrative: string | null
  muapSyncedAt: Date | null
  rskSyncedAt: Date | null
  disbursementStatus: string | null
  disbursementConditions: unknown
  conditionalResponse: string | null
  closedAt: Date | null
  documents: NormalizedDoc[]
  history: NormalizedHistory[]
  assignments: NormalizedAssignment[]
  komiteVotes: NormalizedVote[]
  conversation: NormalizedMessage[]
  approvalSteps: NormalizedStep[]
}

// Safety-critical assembler: normalized aggregate → the exact LoanApplication shape. (BigInt
// plafond→Number, Dates pass through, JSON casts, null→undefined per the map below.) Parity-tested
// via serialize.test.ts. KEEP THIS the single owner of the null/undefined contract.
export function buildLoanApplication(
  app: NormalizedApp,
  checkpoint?: CheckpointRef | null,
): LoanApplication {
  return {
    id: app.id,
    version: app.version,
    nasabahName: app.nasabahName,
    nasabahType: app.nasabahType as 'individual' | 'business',
    nik: app.nik ?? undefined,
    phoneNumber: app.phoneNumber,
    whatsappNumber: app.whatsappNumber ?? undefined,
    namaUsaha: app.namaUsaha ?? undefined,
    npwp: app.npwp ?? undefined,
    nib: app.nib ?? undefined,
    alamat: app.alamat ?? undefined,
    bidangUsaha: app.bidangUsaha ?? undefined,
    extractionExtras: (app.extractionExtras as Record<string, { value: string; sourceDocType: string }> | null) ?? undefined,
    akadType: app.akadType as AkadType,
    requestedPlafond: Number(app.requestedPlafond),
    requestedTenorMonths: app.requestedTenorMonths,
    approvedPlafond: app.approvedPlafond != null ? Number(app.approvedPlafond) : undefined,
    approvedTenorMonths: app.approvedTenorMonths ?? undefined,
    approvedMarginRate: app.approvedMarginRate ?? null,
    extractionSources: (app.extractionSources as Record<string, ExtractionSource> | null) ?? undefined,
    extractionMismatches: (app.extractionMismatches as Record<string, ExtractionMismatch> | null) ?? undefined,
    advisoryExtractions: (app.advisoryExtractions as Record<string, AdvisoryExtraction> | null) ?? undefined,
    purpose: app.purpose,
    incomeSource: (app.incomeSource as IncomeSource | null) ?? undefined,
    isMarried: app.isMarried ?? undefined,
    collateralType: (app.collateralType as CollateralType | null) ?? undefined,
    stage: app.stage as Stage,
    workflowSnapshot:
      (app.workflowSnapshot as WorkflowSnapshot | null) ??
      deriveWorkflowSnapshot({ stage: app.stage as Stage, applicationStatus: app.applicationStatus as LoanApplication['applicationStatus'], closeReason: app.closeReason as LoanApplication['closeReason'] } as LoanApplication),
    assignments: app.assignments.map((a) => ({
      stage: a.stage as Stage,
      role: a.role as Role,
      userId: a.userId,
      userName: a.userName,
      status: a.status as PersonalStatus,
      assignedAt: a.assignedAt,
      submittedAt: a.submittedAt,
    })),
    enteredStageAt: app.enteredStageAt,
    createdAt: app.createdAt,
    createdBy: app.createdBy,
    hardGates: app.hardGates as unknown as HardGates,
    hardGateViolations: (app.hardGateViolations as unknown as HardGateViolation[]) ?? [],
    kolEntered: app.kolEntered,
    financialsAssessed: app.financialsAssessed,
    stage2LegalApproval: (app.stage2LegalApproval as LoanApplication['stage2LegalApproval']) ?? null,
    stage2SlikApproval: (app.stage2SlikApproval as LoanApplication['stage2SlikApproval']) ?? null,
    appraisalPath: (app.appraisalPath as LoanApplication['appraisalPath']) ?? null,
    appraisalRecord: (app.appraisalRecord as LoanApplication['appraisalRecord']) ?? null,
    originType: (app.originType as LoanApplication['originType']) ?? undefined,
    sourceApplicationId: app.sourceApplicationId ?? null,
    disbursedAt: app.disbursedAt ?? null,
    contextMd: app.contextMd ?? null,
    mizanDocFolderId: app.mizanDocFolderId ?? null,
    amlAttestation: (app.amlAttestation as LoanApplication['amlAttestation']) ?? null,
    bureauSummary: (app.bureauSummary as LoanApplication['bureauSummary']) ?? null,
    financialInputs: app.financialInputs as unknown as LoanApplication['financialInputs'],
    marginRate: app.marginRate ?? null,
    documents: app.documents.map((d) => ({
      id: d.id,
      name: d.name,
      docType: d.docType,
      status: d.status as DocumentStatus,
      required: d.required,
      uploadedAt: d.uploadedAt ?? undefined,
      uploadedBy: d.uploadedBy ?? undefined,
      fileName: d.fileName ?? undefined,
      legalVerification: (d.legalVerification as 'pass' | 'fail' | null) ?? null,
      legalVerificationReason: d.legalVerificationReason ?? null,
      storageKey: d.storageKey ?? undefined,
      sha256: d.sha256 ?? undefined,
      sizeBytes: d.sizeBytes ?? undefined,
      contentType: d.contentType ?? undefined,
      extractedText: d.extractedText ?? undefined,
      extractedAt: d.extractedAt ?? undefined,
    })),
    history: app.history.map((h) => ({
      id: h.id,
      timestamp: h.timestamp,
      userId: h.userId,
      userName: h.userName,
      action: h.action,
      stage: h.stage as Stage,
      reason: h.reason ?? undefined,
    })),
    analysis: app.analysis as unknown as FiveCSAnalysis,
    riskRecommendation: (app.riskRecommendation as RiskRecommendation) ?? null,
    riskNote: app.riskNote ?? undefined,
    aiRiskAdvisory: (app.aiRiskAdvisory as LoanApplication['aiRiskAdvisory']) ?? null,
    exploredSources: (app.exploredSources as LoanApplication['exploredSources']) ?? null,
    komiteVotes: app.komiteVotes.map((v) => ({
      userId: v.userId,
      userName: v.userName,
      vote: v.vote as KomiteVoteValue,
      comment: v.comment ?? undefined,
      timestamp: v.timestamp,
      isEarlyVote: v.isEarlyVote,
    })),
    komiteDecision: (app.komiteDecision as KomiteVoteValue | null) ?? undefined,
    komiteDecisionNote: app.komiteDecisionNote ?? undefined,
    decisionCheckpoint: checkpoint ?? null,
    muapNarrative: app.muapNarrative ?? undefined,
    muapSyncedAt: app.muapSyncedAt ?? null,
    rskSyncedAt: app.rskSyncedAt ?? null,
    disbursementStatus: (app.disbursementStatus as DisbursementStatus | null) ?? undefined,
    disbursementConditions: (app.disbursementConditions as Record<string, boolean> | null) ?? undefined,
    applicationStatus: (app.applicationStatus as LoanApplication['applicationStatus']) ?? 'active',
    closeReason: (app.closeReason as LoanApplication['closeReason']) ?? null,
    closedAt: app.closedAt ?? null,
    conditionalResponse: (app.conditionalResponse as LoanApplication['conditionalResponse']) ?? null,
    aiChatHistory: app.conversation
      .filter((m) => m.surface === 'discussion')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        authorId: m.authorId ?? null,
        authorName: m.authorName ?? null,
        mentions: m.mentions ?? [],
      })),
    aiAssistantLog: app.conversation
      .filter((m) => m.surface === 'assistant')
      .slice(-ASSISTANT_WINDOW)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    approvalSteps: app.approvalSteps.map((s) => ({
      chain: s.chain as ApprovalChain | 'mom',
      role: s.role as ApprovalRole | 'komite-signer',
      action: s.action as ApprovalAction,
      userId: s.userId,
      userName: s.userName,
      reason: s.reason,
      qrToken: s.qrToken,
      createdAt: s.createdAt,
    })),
  }
}
