import 'server-only'
import { FieldPath, type Firestore, type Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { LoanApplication } from '@/lib/types'
import { appRef, subCol, SUB, COL } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import {
  buildLoanApplication,
  toCheckpointRef,
  type CheckpointRef,
  type NormalizedApp,
  type NormalizedDoc,
  type NormalizedHistory,
  type NormalizedAssignment,
  type NormalizedVote,
  type NormalizedMessage,
  type NormalizedStep,
} from './serialize.shared'

// The Firestore ADAPTER for the application read boundary — mirror of serialize.ts (Prisma). Reads
// the applications/{id} root doc + its 6 subcollections, normalizes (Timestamp→Date), and delegates
// to the shared buildLoanApplication so the EXACT same LoanApplication shape is produced on both
// backends. Ordering parity: history/conversation/approvalSteps use padded-seq doc-ids, so ordering
// by documentId reproduces the Prisma include orderings (seq asc / [surface asc, seq asc] /
// [createdAt asc, id asc]) WITHOUT composite indexes; assignments/komiteVotes order by their date field.

type Data = Record<string, unknown>

const str = (d: Data, k: string): string | null => (d[k] as string | null | undefined) ?? null
const num = (d: Data, k: string): number | null => (d[k] as number | null | undefined) ?? null
const bool = (d: Data, k: string): boolean => (d[k] as boolean | undefined) ?? false
const date = (d: Data, k: string): Date | null => toDate(d[k] as Timestamp | Date | null | undefined) ?? null
const json = (d: Data, k: string): unknown => d[k] ?? null

function normalizeDoc(s: QueryDocumentSnapshot): NormalizedDoc {
  const d = s.data() as Data
  return {
    id: (d.id as string | undefined) ?? s.id,
    name: str(d, 'name') ?? '',
    docType: str(d, 'docType') ?? '',
    status: str(d, 'status') ?? '',
    required: bool(d, 'required'),
    uploadedAt: date(d, 'uploadedAt'),
    uploadedBy: str(d, 'uploadedBy'),
    fileName: str(d, 'fileName'),
    legalVerification: str(d, 'legalVerification'),
    legalVerificationReason: str(d, 'legalVerificationReason'),
    storageKey: str(d, 'storageKey'),
    sha256: str(d, 'sha256'),
    sizeBytes: num(d, 'sizeBytes'),
    contentType: str(d, 'contentType'),
    extractedText: str(d, 'extractedText'),
    extractedAt: date(d, 'extractedAt'),
  }
}

function normalizeHistory(s: QueryDocumentSnapshot): NormalizedHistory {
  const d = s.data() as Data
  return {
    id: (d.id as string | undefined) ?? s.id,
    timestamp: date(d, 'timestamp') ?? new Date(0),
    userId: str(d, 'userId') ?? '',
    userName: str(d, 'userName') ?? '',
    action: str(d, 'action') ?? '',
    stage: num(d, 'stage') ?? 0,
    reason: str(d, 'reason'),
  }
}

function normalizeAssignment(s: QueryDocumentSnapshot): NormalizedAssignment {
  const d = s.data() as Data
  return {
    stage: num(d, 'stage') ?? 0,
    role: str(d, 'role') ?? '',
    userId: str(d, 'userId') ?? '',
    userName: str(d, 'userName') ?? '',
    status: str(d, 'status') ?? '',
    assignedAt: date(d, 'assignedAt') ?? new Date(0),
    submittedAt: date(d, 'submittedAt'),
  }
}

function normalizeVote(s: QueryDocumentSnapshot): NormalizedVote {
  const d = s.data() as Data
  return {
    userId: (d.userId as string | undefined) ?? s.id, // docId IS userId (one-vote-per-member)
    userName: str(d, 'userName') ?? '',
    vote: str(d, 'vote') ?? '',
    comment: str(d, 'comment'),
    timestamp: date(d, 'timestamp') ?? new Date(0),
    isEarlyVote: bool(d, 'isEarlyVote'),
  }
}

function normalizeMessage(s: QueryDocumentSnapshot): NormalizedMessage {
  const d = s.data() as Data
  return {
    surface: str(d, 'surface') ?? '',
    role: str(d, 'role') ?? '',
    content: str(d, 'content') ?? '',
    authorId: str(d, 'authorId'),
    authorName: str(d, 'authorName'),
    mentions: (d.mentions as string[] | undefined) ?? [],
  }
}

function normalizeStep(s: QueryDocumentSnapshot): NormalizedStep {
  const d = s.data() as Data
  return {
    chain: str(d, 'chain') ?? '',
    role: str(d, 'role') ?? '',
    action: str(d, 'action') ?? '',
    userId: str(d, 'userId') ?? '',
    userName: str(d, 'userName') ?? '',
    reason: str(d, 'reason'),
    qrToken: str(d, 'qrToken'),
    createdAt: date(d, 'createdAt') ?? new Date(0),
  }
}

// Build a NormalizedApp from the root doc data + already-mapped child arrays, then assemble.
export function docToLoanApplication(
  rootData: Data,
  rootId: string,
  children: {
    documents: NormalizedDoc[]
    history: NormalizedHistory[]
    assignments: NormalizedAssignment[]
    komiteVotes: NormalizedVote[]
    conversation: NormalizedMessage[]
    approvalSteps: NormalizedStep[]
  },
  checkpoint?: CheckpointRef | null,
): LoanApplication {
  const d = rootData
  const normalized: NormalizedApp = {
    id: (d.id as string | undefined) ?? rootId,
    version: num(d, 'version') ?? 0,
    nasabahName: str(d, 'nasabahName') ?? '',
    nasabahType: str(d, 'nasabahType') ?? 'individual',
    nik: str(d, 'nik'),
    phoneNumber: str(d, 'phoneNumber') ?? '',
    whatsappNumber: str(d, 'whatsappNumber'),
    namaUsaha: str(d, 'namaUsaha'),
    npwp: str(d, 'npwp'),
    nib: str(d, 'nib'),
    alamat: str(d, 'alamat'),
    bidangUsaha: str(d, 'bidangUsaha'),
    extractionExtras: json(d, 'extractionExtras'),
    akadType: str(d, 'akadType') ?? '',
    requestedPlafond: num(d, 'requestedPlafond') ?? 0,
    requestedTenorMonths: num(d, 'requestedTenorMonths') ?? 0,
    approvedPlafond: num(d, 'approvedPlafond'),
    approvedTenorMonths: num(d, 'approvedTenorMonths'),
    approvedMarginRate: num(d, 'approvedMarginRate'),
    extractionSources: json(d, 'extractionSources'),
    extractionMismatches: json(d, 'extractionMismatches'),
    advisoryExtractions: json(d, 'advisoryExtractions'),
    purpose: str(d, 'purpose') ?? '',
    incomeSource: str(d, 'incomeSource'),
    isMarried: (d.isMarried as boolean | null | undefined) ?? null,
    collateralType: str(d, 'collateralType'),
    stage: num(d, 'stage') ?? 1,
    workflowSnapshot: json(d, 'workflowSnapshot'),
    applicationStatus: str(d, 'applicationStatus'),
    closeReason: str(d, 'closeReason'),
    enteredStageAt: date(d, 'enteredStageAt') ?? new Date(0),
    createdAt: date(d, 'createdAt') ?? new Date(0),
    createdBy: str(d, 'createdBy') ?? '',
    hardGates: json(d, 'hardGates'),
    hardGateViolations: (d.hardGateViolations as unknown[] | undefined) ?? [],
    kolEntered: bool(d, 'kolEntered'),
    financialsAssessed: bool(d, 'financialsAssessed'),
    stage2LegalApproval: json(d, 'stage2LegalApproval'),
    stage2SlikApproval: json(d, 'stage2SlikApproval'),
    appraisalPath: json(d, 'appraisalPath'),
    appraisalRecord: json(d, 'appraisalRecord'),
    originType: json(d, 'originType'),
    sourceApplicationId: str(d, 'sourceApplicationId'),
    disbursedAt: date(d, 'disbursedAt'),
    contextMd: str(d, 'contextMd'),
    mizanDocFolderId: str(d, 'mizanDocFolderId'),
    amlAttestation: json(d, 'amlAttestation'),
    bureauSummary: json(d, 'bureauSummary'),
    financialInputs: json(d, 'financialInputs'),
    marginRate: num(d, 'marginRate'),
    analysis: json(d, 'analysis'),
    riskRecommendation: str(d, 'riskRecommendation'),
    riskNote: str(d, 'riskNote'),
    aiRiskAdvisory: json(d, 'aiRiskAdvisory'),
    exploredSources: json(d, 'exploredSources'),
    komiteDecision: str(d, 'komiteDecision'),
    komiteDecisionNote: str(d, 'komiteDecisionNote'),
    muapNarrative: str(d, 'muapNarrative'),
    muapSyncedAt: date(d, 'muapSyncedAt'),
    rskSyncedAt: date(d, 'rskSyncedAt'),
    disbursementStatus: str(d, 'disbursementStatus'),
    disbursementConditions: json(d, 'disbursementConditions'),
    conditionalResponse: str(d, 'conditionalResponse'),
    closedAt: date(d, 'closedAt'),
    documents: children.documents,
    history: children.history,
    assignments: children.assignments,
    komiteVotes: children.komiteVotes,
    conversation: children.conversation,
    approvalSteps: children.approvalSteps,
  }
  return buildLoanApplication(normalized, checkpoint)
}

// Load the full application aggregate from Firestore (root doc + 6 subcollections), or null. Does
// I/O. CRITICAL (critique #14): this NEVER self-fetches the DecisionCheckpoint — callers that need it
// (getApplication / loadApplicationForWrite) fetch it and pass it; approval re-reads pass undefined→null.
export async function loadApplicationDoc(
  db: Firestore,
  id: string,
  checkpoint?: CheckpointRef | null,
): Promise<LoanApplication | null> {
  const rootSnap = await appRef(db, id).get()
  if (!rootSnap.exists) return null

  const byId = FieldPath.documentId()
  const [docs, hist, assign, votes, conv, steps] = await Promise.all([
    subCol(db, id, SUB.documents).orderBy(byId).get(),
    subCol(db, id, SUB.history).orderBy(byId).get(), // docId = pad7(seq) ⇒ seq asc
    subCol(db, id, SUB.assignments).orderBy('assignedAt', 'asc').get(),
    subCol(db, id, SUB.komiteVotes).orderBy('timestamp', 'asc').get(),
    subCol(db, id, SUB.conversation).orderBy(byId).get(), // docId = surface__pad7(seq) ⇒ [surface asc, seq asc]
    subCol(db, id, SUB.approvalSteps).orderBy(byId).get(), // docId = pad7(seq) ⇒ [createdAt asc, id asc]
  ])

  return docToLoanApplication(rootSnap.data() as Data, rootSnap.id, {
    documents: docs.docs.map(normalizeDoc),
    history: hist.docs.map(normalizeHistory),
    assignments: assign.docs.map(normalizeAssignment),
    komiteVotes: votes.docs.map(normalizeVote),
    conversation: conv.docs.map(normalizeMessage),
    approvalSteps: steps.docs.map(normalizeStep),
  }, checkpoint)
}

// Latest DecisionCheckpoint for an app → CheckpointRef, or null. The aggregate read paths that carry
// the checkpoint (getApplication / loadApplicationForWrite) call this and PASS the result to
// loadApplicationDoc; loadApplicationDoc itself never self-fetches it (critique #14), so the approval
// re-read can omit it for parity with the Prisma seam.
export async function latestCheckpoint(db: Firestore, appId: string): Promise<CheckpointRef | null> {
  const snap = await db
    .collection(COL.decisionCheckpoints)
    .where('applicationId', '==', appId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  if (snap.empty) return null
  const s = snap.docs[0]
  const d = s.data() as Data
  return toCheckpointRef({
    id: (d.id as string | undefined) ?? s.id,
    contentHash: d.contentHash as string,
    decidedAt: toDate(d.decidedAt as Timestamp),
    riskPolicyVersion: (d.riskPolicyVersion as number | null | undefined) ?? null,
    riskDsrMaxPct: (d.riskDsrMaxPct as number | null | undefined) ?? null,
    riskLtvMaxPct: (d.riskLtvMaxPct as number | null | undefined) ?? null,
    riskKolMax: (d.riskKolMax as number | null | undefined) ?? null,
  })
}
