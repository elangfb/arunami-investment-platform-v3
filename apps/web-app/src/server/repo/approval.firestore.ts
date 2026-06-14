import 'server-only'
import { randomBytes } from 'node:crypto'
import { FieldValue, type Timestamp, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import type { LoanApplication } from '@/lib/types'
import type { ApprovalAction, ApprovalChain, ApprovalRole } from '@/lib/approval-chain'
import { getDb } from '@/server/firebase/firestore'
import { appRef, subCol, SUB, IDX } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import { pad7, approvalStepDocId, historyId } from './doc-ids'
import { loadApplicationDoc } from './serialize.firestore'
import { ConcurrencyError } from './errors'
import type { ApprovalStepRow, QrVerification } from './approval.prisma'

// Firestore impl of the append-only maker-checker ledger — parity with approval.prisma.ts. Steps live
// in applications/{appId}/approvalSteps/{pad7(seq)} (seq = per-app monotonic, so docId order ==
// [createdAt asc, id asc]). appendApprovalStep is a tx: version guard + step create + qrToken index
// create + audit history append. verifyQrToken resolves index_qrTokens/{token} → step → app.

type Data = Record<string, unknown>

function snapToStep(s: DocumentSnapshot): ApprovalStepRow {
  const d = (s.data() ?? {}) as Data
  return {
    id: s.id,
    chain: d.chain as ApprovalChain,
    role: d.role as ApprovalRole,
    action: d.action as ApprovalAction,
    userId: d.userId as string,
    userName: d.userName as string,
    reason: (d.reason as string | null | undefined) ?? null,
    qrToken: (d.qrToken as string | null | undefined) ?? null,
    createdAt: toDate(d.createdAt as Timestamp | undefined) ?? new Date(0),
  }
}

export async function loadApprovalSteps(appId: string, chain?: ApprovalChain | 'mom'): Promise<ApprovalStepRow[]> {
  let q = subCol(getDb(), appId, SUB.approvalSteps).orderBy('seq', 'asc')
  if (chain) q = subCol(getDb(), appId, SUB.approvalSteps).where('chain', '==', chain).orderBy('seq', 'asc')
  const snap = await q.get()
  return snap.docs.map(snapToStep)
}

export async function loadMomSignatures(appId: string): Promise<ApprovalStepRow[]> {
  return loadApprovalSteps(appId, 'mom')
}

export async function appendApprovalStep(opts: {
  appId: string
  expectedVersion: number
  chain: ApprovalChain | 'mom'
  role: ApprovalRole | 'komite-signer'
  action: ApprovalAction
  userId: string
  userName: string
  reason?: string
  audit: { action: string; stage: number }
}): Promise<LoanApplication> {
  const db = getDb()
  // QR mint on approve/request (the signature anchor); reject mints none. Match write.prisma scheme.
  const qrToken = opts.action === 'approve' || opts.action === 'request' ? randomBytes(24).toString('base64url') : null

  await db.runTransaction(async (tx: Transaction) => {
    // READS
    const rootSnap = await tx.get(appRef(db, opts.appId))
    if (!rootSnap.exists) throw new ConcurrencyError()
    if (((rootSnap.data() as Data).version as number | undefined ?? 0) !== opts.expectedVersion) throw new ConcurrencyError()

    const lastStep = await tx.get(subCol(db, opts.appId, SUB.approvalSteps).orderBy('seq', 'desc').limit(1))
    const stepSeq = (lastStep.empty ? -1 : (lastStep.docs[0].data().seq as number)) + 1
    const lastHist = await tx.get(subCol(db, opts.appId, SUB.history).orderBy('seq', 'desc').limit(1))
    const hseq = (lastHist.empty ? 0 : (lastHist.docs[0].data().seq as number)) + 1

    // WRITES
    tx.update(appRef(db, opts.appId), { version: opts.expectedVersion + 1, updatedAt: FieldValue.serverTimestamp() })
    const stepId = approvalStepDocId(stepSeq)
    tx.create(subCol(db, opts.appId, SUB.approvalSteps).doc(stepId), {
      seq: stepSeq,
      chain: opts.chain,
      role: opts.role,
      action: opts.action,
      userId: opts.userId,
      userName: opts.userName,
      reason: opts.reason ?? null,
      qrToken,
      createdAt: FieldValue.serverTimestamp(),
    })
    if (qrToken) {
      // index_qrTokens/{token} — uniqueness backstop + the verifyQrToken lookup (stores appId + stepId).
      tx.create(db.collection(IDX.qrTokens).doc(qrToken), { appId: opts.appId, stepId })
    }
    tx.create(subCol(db, opts.appId, SUB.history).doc(pad7(hseq)), {
      id: historyId(hseq, opts.appId),
      seq: hseq,
      timestamp: FieldValue.serverTimestamp(),
      userId: opts.userId,
      userName: opts.userName,
      action: opts.audit.action,
      stage: opts.audit.stage,
      reason: opts.reason ?? null,
    })
  })

  // Approval re-read attaches NO checkpoint (parity with approval.prisma rowToLoanApplication(row)).
  const fresh = await loadApplicationDoc(db, opts.appId)
  if (!fresh) throw new Error(`Application ${opts.appId} vanished after approval-step append`)
  return fresh
}

export async function appendMomSignature(opts: {
  appId: string
  expectedVersion: number
  userId: string
  userName: string
  audit: { action: string; stage: number }
}): Promise<LoanApplication> {
  return appendApprovalStep({ ...opts, chain: 'mom', role: 'komite-signer', action: 'approve' })
}

export async function verifyQrToken(token: string): Promise<QrVerification | null> {
  const db = getDb()
  const idx = await db.collection(IDX.qrTokens).doc(token).get()
  if (!idx.exists) return null
  const { appId, stepId } = idx.data() as { appId: string; stepId: string }
  const stepSnap = await subCol(db, appId, SUB.approvalSteps).doc(stepId).get()
  if (!stepSnap.exists) return null
  const appSnap = await appRef(db, appId).get()
  if (!appSnap.exists) return null
  return {
    step: snapToStep(stepSnap),
    applicationId: appId,
    nasabahName: (appSnap.data() as Data).nasabahName as string,
  }
}
