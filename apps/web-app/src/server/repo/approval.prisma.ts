import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '../db'
import { ConcurrencyError } from './write'
import { APPLICATION_INCLUDE, rowToLoanApplication } from './serialize'
import type { LoanApplication } from '@/lib/types'
import type {
  ApprovalAction,
  ApprovalChain,
  ApprovalRole,
  ApprovalStepEntry,
} from '@/lib/approval-chain'

// Persistence for the append-only maker-checker ladder ledger (ApprovalStep). The RULES
// (order, distinct-approver, cycle) live in lib/approval-chain.ts and are enforced by the
// action layer before it calls in here; this module only appends rows + reads them back. A
// row is NEVER updated or deleted — re-handling after a send-back appends a fresh `request`.

/** A persisted ledger row. Superset of the reducer's ApprovalStepEntry (the extra fields are audit/QR). */
export interface ApprovalStepRow extends ApprovalStepEntry {
  id: string
  userName: string
  reason: string | null
  /** The per-signature QR anchor — present only on approve/sign rows. Opaque, unguessable, unique. */
  qrToken: string | null
  createdAt: Date
}

/** Read the ledger for an application (optionally a single chain), in insertion order. */
export async function loadApprovalSteps(
  appId: string,
  chain?: ApprovalChain | 'mom',
): Promise<ApprovalStepRow[]> {
  const rows = await prisma.approvalStep.findMany({
    where: { applicationId: appId, ...(chain ? { chain } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return rows.map((r) => ({
    id: r.id,
    chain: r.chain as ApprovalChain,
    role: r.role as ApprovalRole,
    action: r.action as ApprovalAction,
    userId: r.userId,
    userName: r.userName,
    reason: r.reason,
    qrToken: r.qrToken,
    createdAt: r.createdAt,
  }))
}

/** Read an app's MoM signature ledger (chain='mom', unordered Komite attestations). */
export async function loadMomSignatures(appId: string): Promise<ApprovalStepRow[]> {
  return loadApprovalSteps(appId, 'mom')
}

/**
 * Append ONE ladder action to the ledger, atomically with an audit HistoryEntry and the
 * Application version bump (same optimistic-concurrency guard as saveApplication, so a
 * concurrent workflow write cannot interleave). Mints a long unguessable `qrToken` on
 * approve/sign rows — the signature's QR anchor (resolved at /qr/<token> → signer + when).
 * Returns the fresh aggregate. NEVER updates/deletes an existing row.
 */
export async function appendApprovalStep(opts: {
  appId: string
  expectedVersion: number
  chain: ApprovalChain | 'mom'
  role: ApprovalRole | 'komite-signer'
  action: ApprovalAction
  userId: string
  userName: string
  reason?: string
  /** Audit line for the history ledger (action verb + stage shown in the trail). */
  audit: { action: string; stage: number }
}): Promise<LoanApplication> {
  // Signature rows mint a QR: checker `approve` rungs AND the maker's `request` (the maker's `request`
  // IS the pengaju's signature — slot `tanggal_ttd_rm`/`rsk_sig_analyst_tanggal`). `reject` is not a
  // signature, so it mints none. A re-`request` after a send-back re-signs the resubmission (fresh token).
  const qrToken = opts.action === 'approve' || opts.action === 'request' ? randomBytes(24).toString('base64url') : null

  await prisma.$transaction(async (tx) => {
    const guard = await tx.application.updateMany({
      where: { id: opts.appId, version: opts.expectedVersion },
      data: { version: { increment: 1 } },
    })
    if (guard.count === 0) throw new ConcurrencyError()

    await tx.approvalStep.create({
      data: {
        applicationId: opts.appId,
        chain: opts.chain,
        role: opts.role,
        action: opts.action,
        userId: opts.userId,
        userName: opts.userName,
        reason: opts.reason ?? null,
        qrToken,
      },
    })

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
        userId: opts.userId,
        userName: opts.userName,
        action: opts.audit.action,
        stage: opts.audit.stage,
        reason: opts.reason ?? null,
      },
    })
  })

  const row = await prisma.application.findUnique({
    where: { id: opts.appId },
    include: APPLICATION_INCLUDE,
  })
  if (!row) throw new Error(`Application ${opts.appId} vanished after approval-step append`)
  return rowToLoanApplication(row)
}

/** Append ONE Komite MoM signature (ADR-0005): an unordered attestation on the per-app minutes,
 *  reusing the ApprovalStep ledger (chain='mom') so it inherits the same QR mint + audit + version
 *  guard + verify path as the ladder. Role is the sentinel 'komite-signer'; signer identity = userId. */
export async function appendMomSignature(opts: {
  appId: string
  expectedVersion: number
  userId: string
  userName: string
  audit: { action: string; stage: number }
}): Promise<LoanApplication> {
  return appendApprovalStep({ ...opts, chain: 'mom', role: 'komite-signer', action: 'approve' })
}

/** What a scanned QR resolves to: the signature + its application context. Internal / auth-walled. */
export interface QrVerification {
  step: ApprovalStepRow
  applicationId: string
  nasabahName: string
}

/**
 * Resolve a scanned QR token → the signature it anchors (signer, role, chain, when) + the
 * application it belongs to, or null if the token is unknown. The token is opaque + unique, so
 * this is the only way to turn it back into a verifiable signature record.
 */
export async function verifyQrToken(token: string): Promise<QrVerification | null> {
  const row = await prisma.approvalStep.findUnique({
    where: { qrToken: token },
    include: { application: { select: { id: true, nasabahName: true } } },
  })
  if (!row) return null
  return {
    step: {
      id: row.id,
      chain: row.chain as ApprovalChain,
      role: row.role as ApprovalRole,
      action: row.action as ApprovalAction,
      userId: row.userId,
      userName: row.userName,
      reason: row.reason,
      qrToken: row.qrToken,
      createdAt: row.createdAt,
    },
    applicationId: row.application.id,
    nasabahName: row.application.nasabahName,
  }
}
