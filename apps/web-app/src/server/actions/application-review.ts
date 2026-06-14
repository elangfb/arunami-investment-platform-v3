'use server'

import { requireActor } from '@/server/auth/session'
import { assertDesk } from '@/lib/auth/can'
import { startReviewForActor, startAdendumForActor } from './application-review.core'
import type { LoanApplication } from '@/lib/types'

// Thin 'use server' wrappers for the review/adendum CHILD-create (RM-led redesign §7 / Topic 7).
// Resolve + authorize the actor (intake desk — RM starts both a periodic review and a nasabah adendum),
// then delegate to the actor-injected core (application-review.core.ts) which builds the carry-forward
// Stage-1 app, links the lineage + the SAME Customer, and persists via createApplicationForActor. The
// core is server-only and NOT a server action, so the actor-trusting entry point is never over-the-wire.

/// Start a Bank-initiated periodic REVIEW of an existing facility (`parentId`). Optional off-cadence
/// `reason` (e.g. a macet-bayar trigger) is recorded as a body-free audit entry on the new app.
export async function startReviewAction(parentId: string, reason?: string): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'intake')
  return startReviewForActor(actor, parentId, reason)
}

/// Start a Nasabah-initiated ADENDUM (term change) on an existing facility (`parentId`). Same
/// mechanics as a review; distinguished by originType='adendum'. Optional recorded `reason`.
export async function startAdendumAction(parentId: string, reason?: string): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'intake')
  return startAdendumForActor(actor, parentId, reason)
}
