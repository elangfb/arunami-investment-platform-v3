import 'server-only'

import { getApplication, getApplicationCustomerId } from '@/server/repo/applications'
import { createApplicationForActor, type CreateAppInput } from './application-create.core'
import { appendHistory } from '@/lib/history'
import { saveApplication, loadApplicationForWrite } from '@/server/repo/write'
import { auditUserName, type Actor } from '@/lib/auth/can'
import type { LoanApplication } from '@/lib/types'

// Actor-injected core of the review/adendum CHILD-create (RM-led redesign §7 / Topic 7). Kept OUT of
// the 'use server' module so the actor-trusting entry point is never registered as a public action
// (mirrors application-create.ts vs .core.ts). The 'use server' wrappers (application-review.ts) resolve
// + gate the actor (assertDesk 'intake'), then call these.
//
// A Review (Bank-initiated periodic health-check) and an Adendum (Nasabah-initiated term change) BOTH
// reuse the FULL pipeline — they differ only by initiator (the originType tag). Each builds a fresh
// Stage-1 app from the parent: it carries FORWARD the identity + current terms + the SAME Customer
// (customerId), sets originType + sourceApplicationId=parentId (the lineage link), and goes through
// createApplicationForActor — which nulls amlAttestation, so the child starts UNATTESTED and the
// existing muapToRiskBlockers requires a fresh AML attest (NO gate change). An optional off-cadence
// `reason` is recorded as a body-free audit HistoryEntry on the NEW app.

/** Build the carry-forward CreateAppInput from the parent app — identity + current terms + the SAME
 *  Customer (customerId). originType + sourceApplicationId are injected by the caller. The child does
 *  NOT inherit the parent's attestation/financials/stage (createApplicationForActor zeroes those). */
function carryForwardInput(
  parent: LoanApplication,
  originType: 'review' | 'adendum',
  parentCustomerId: string | undefined,
): CreateAppInput {
  return {
    // Identity (carried forward verbatim — the same nasabah/usaha).
    nasabahName: parent.nasabahName,
    nasabahType: parent.nasabahType,
    phoneNumber: parent.phoneNumber,
    ...(parent.whatsappNumber ? { whatsappNumber: parent.whatsappNumber } : {}),
    ...(parent.namaUsaha ? { namaUsaha: parent.namaUsaha } : {}),
    ...(parent.nik ? { nik: parent.nik } : {}),
    ...(parent.npwp ? { npwp: parent.npwp } : {}),
    ...(parent.nib ? { nib: parent.nib } : {}),
    ...(parent.alamat ? { alamat: parent.alamat } : {}),
    ...(parent.bidangUsaha ? { bidangUsaha: parent.bidangUsaha } : {}),
    ...(parent.incomeSource ? { incomeSource: parent.incomeSource } : {}),
    ...(parent.isMarried !== undefined ? { isMarried: parent.isMarried } : {}),
    // Current terms (carried forward — the starting point the review/adendum re-underwrites).
    akadType: parent.akadType,
    collateralType: parent.collateralType ?? 'none', // optional on the aggregate, required on input
    requestedPlafond: parent.requestedPlafond,
    requestedTenorMonths: parent.requestedTenorMonths,
    purpose: parent.purpose,
    // Lineage + origin (the distinguishing marks).
    originType,
    sourceApplicationId: parent.id,
    // The SAME Customer — link-direct (skips dedup) so the child never forks a duplicate Nasabah.
    ...(parentCustomerId ? { customerId: parentCustomerId } : {}),
  }
}

/** Resolve the parent's linked Customer id (the child reuses the SAME Customer). Read from the raw
 *  row (the aggregate doesn't surface customerId); null when the parent is unlinked (pre-migration). */
async function parentCustomerId(parentId: string): Promise<string | undefined> {
  return (await getApplicationCustomerId(parentId)) ?? undefined
}

/** Record an optional off-cadence reason as a body-free audit HistoryEntry on the new child app.
 *  (An on-cadence review carries no reason; off-cadence reviews/adendums are RM-started WITH one.) */
async function recordReason(child: LoanApplication, actor: Actor, originType: 'review' | 'adendum', reason: string): Promise<LoanApplication> {
  const fresh = await loadApplicationForWrite(child.id)
  if (!fresh) return child
  const label = originType === 'review' ? 'Review dimulai' : 'Adendum dimulai'
  appendHistory(fresh, { userId: actor.userId, userName: auditUserName(actor), action: `${label} (alasan dicatat)`, stage: fresh.stage, reason })
  return saveApplication(fresh)
}

async function startChild(actor: Actor, parentId: string, originType: 'review' | 'adendum', reason?: string): Promise<LoanApplication> {
  const parent = await getApplication(parentId)
  if (!parent) throw new Error(`Aplikasi induk tidak ditemukan: ${parentId}`)
  const input = carryForwardInput(parent, originType, await parentCustomerId(parentId))
  const child = await createApplicationForActor(actor, input)
  return reason?.trim() ? recordReason(child, actor, originType, reason.trim()) : child
}

/** Start a Bank-initiated periodic REVIEW of an existing facility — a fresh Stage-1 app that reuses the
 *  full pipeline, carries the parent's identity + current terms + the SAME Customer, and links the
 *  lineage (sourceApplicationId=parentId). Caller MUST gate (the action asserts 'intake'). */
export async function startReviewForActor(actor: Actor, parentId: string, reason?: string): Promise<LoanApplication> {
  return startChild(actor, parentId, 'review', reason)
}

/** Start a Nasabah-initiated ADENDUM (term change) on an existing facility — same mechanics as a review,
 *  distinguished only by originType='adendum'. Caller MUST gate (the action asserts 'intake'). */
export async function startAdendumForActor(actor: Actor, parentId: string, reason?: string): Promise<LoanApplication> {
  return startChild(actor, parentId, 'adendum', reason)
}
