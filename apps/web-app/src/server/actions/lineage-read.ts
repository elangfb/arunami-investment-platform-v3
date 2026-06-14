'use server'

import { requireActor } from '@/server/auth/session'
import { getReviewDueAnchors } from '@/server/repo/review-cadence-read'
import { getLineage, lineageHead } from '@/server/repo'
import { reviewDueState, type ReviewDueState } from '@/lib/review-cadence'
import type { LoanApplication } from '@/lib/types'

// Thin client-read actions for the P5 review/adendum lineage UI (RM-led redesign §7 / Topic 7). The
// RingkasanView "Riwayat fasilitas" card and the review-due chip mount on the client; rather than thread
// the lineage/customer through DossierLayout → DossierContent → RingkasanView, the card fetches them
// here on mount. READ is open to any authenticated actor (requireActor only — mirrors the open Nasabah
// read; the CREATE path stays intake-gated in application-review.ts).

/// The FULL facility lineage in CAUSAL order (root → … → head), fetched from ANY node in the chain. We
/// resolve the HEAD first (lineageHead walks DOWN to the most-recent cycle = "current terms"), then run
/// getLineage from the head (which walks UP to the root and returns root-first). This yields the whole
/// chain regardless of whether the viewed app is the root, a middle cycle, or the head — so a ROOT app
/// that has children still renders its descendants, and a head still renders its ancestors. The last
/// element is the head ("ketentuan terkini"). A standalone original (no parent, no children) returns a
/// single-element chain (the caller hides the card in that case via `lineage.length <= 1`).
export async function getFacilityLineageAction(appId: string): Promise<LoanApplication[]> {
  await requireActor()
  const head = await lineageHead(appId)
  if (!head) return []
  return getLineage(head.id)
}

/// The review-due state for an app's facility, evaluated NOW. Resolves the app's date/scalar anchors +
/// its Customer cadence override and runs the PURE reviewDueState (lib/review-cadence.ts). Reads ONLY
/// dates (disbursedAt, the cadence months, now) — NEVER any payment/Kol/balance signal (INVARIANT
/// "Mizan records, never monitors"). Returns 'n/a' for an undisbursed/closed facility.
export async function getReviewDueStateAction(appId: string): Promise<ReviewDueState> {
  await requireActor()
  const anchors = await getReviewDueAnchors(appId)
  if (!anchors) return { status: 'n/a', dueDate: null }
  return reviewDueState(
    {
      id: anchors.id,
      disbursedAt: anchors.disbursedAt,
      applicationStatus: (anchors.applicationStatus as 'active' | 'closed' | null) ?? undefined,
    },
    anchors.reviewCadenceMonths != null ? { reviewCadenceMonths: anchors.reviewCadenceMonths } : null,
    new Date(),
  )
}
