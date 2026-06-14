import 'server-only'

import { listReviewDueFacilities } from '@/server/repo/review-cadence-read'
import { reviewDueState } from '@/lib/review-cadence'
import type { ReviewDueNotice } from '@/lib/notifications'

// Server resolver for the review-cadence notices (RM-led redesign §7 / Topic 7). Joins each DISBURSED
// facility (app.disbursedAt set) to its Customer's cadence override and runs the PURE reviewDueState
// (lib/review-cadence.ts) at `now`. Emits one ReviewDueNotice per facility whose status is 'due' or
// 'soon'; 'ok'/'n-a' raise none. The /notifications page + the sidebar badge both call this so they
// never disagree (same single-source DERIVED pattern as coleks/mentions — no Notify store).
//
// INVARIANT "Mizan records, never monitors": the only signals read are DATES (disbursedAt, the cadence
// months, now) — NEVER any payment/Kol/balance. The query selects exactly those date/scalar columns.
//
// `actor` is accepted for signature parity with the other actor-aware resolvers (and to allow a later
// scope-to-actor refinement); today the cadence flag is facility-derived, so the page filters by
// canActOnDesk like the SLA/docs builders rather than the resolver pre-filtering by actor.
export async function listReviewDueNotices(now: Date = new Date()): Promise<ReviewDueNotice[]> {
  // Only disbursed, non-closed facilities can have a due review. Pull just the date/scalar columns the
  // pure evaluator needs + the joined cadence override — never any payment/balance signal (none exist).
  const rows = await listReviewDueFacilities()
  const notices: ReviewDueNotice[] = []
  for (const row of rows) {
    const state = reviewDueState(
      { id: row.id, disbursedAt: row.disbursedAt, applicationStatus: (row.applicationStatus as 'active' | 'closed' | null) ?? undefined },
      row.reviewCadenceMonths != null ? { reviewCadenceMonths: row.reviewCadenceMonths } : null,
      now,
    )
    if ((state.status === 'due' || state.status === 'soon') && state.dueDate) {
      notices.push({ appId: row.id, nasabahName: row.nasabahName, status: state.status, dueDate: state.dueDate })
    }
  }
  return notices
}
