import type { LoanApplication } from '@/lib/types'

// PURE review-cadence math (RM-led redesign §7 / Topic 7). No DB, no I/O — reads only DATES.
// INVARIANT "Mizan records, never monitors": the cadence anchors on the disbursement DATE
// (app.disbursedAt), NEVER on any payment/Kol/balance signal. Mizan flags scheduled reviews from
// ITS OWN CALENDAR only; off-cadence (macet-bayar) reviews are RM-started with a recorded reason and
// do NOT come from this module.

/** The cadence cascade default when no Nasabah/facility override is set (unit: calendar months). */
export const CADENCE_DEFAULT_MONTHS = 12

/** ~30-day "soon" window before the due date (warn the RM a scheduled review is approaching). */
const SOON_WINDOW_DAYS = 30

/** Minimal structural shape the cadence reads off a Customer — just the override. Kept structural so
 *  this PURE lib needs no server-only repo import (the server resolver passes the real Customer). */
export interface CadenceCustomer {
  reviewCadenceMonths?: number | null
}

/**
 * Calendar-month add with END-OF-MONTH CLAMP. addMonths(Jan 31, 1) → Feb 28/29 (not Mar 2/3): when the
 * source day-of-month overflows the target month it clamps to that month's last day. Pure; returns a
 * NEW Date (does not mutate the input). Operates in the host timezone's calendar — for the Jakarta
 * day-correct anchor the caller passes a Date already at the right instant (the cadence is calendar
 * months, no business-day math).
 */
export function addMonths(date: Date, n: number): Date {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  // Last day of the target month: day 0 of the month AFTER the target rolls back to its final day.
  const lastDayOfTarget = new Date(y, m + n + 1, 0).getDate()
  const clampedDay = Math.min(d, lastDayOfTarget)
  const result = new Date(date.getTime())
  result.setFullYear(y, m + n, clampedDay)
  return result
}

/**
 * The cadence (in months) for this app's facility. Cascade: Nasabah override (customer.reviewCadenceMonths)
 * → CADENCE_DEFAULT_MONTHS (12). The FACILITY-level override is DEFERRED (C7 — no facility entity yet),
 * so only the two cascade levels resolve today. A non-positive/invalid override falls back to the default.
 */
export function reviewCadenceMonths(_app: Pick<LoanApplication, 'id'>, customer: CadenceCustomer | null | undefined): number {
  const override = customer?.reviewCadenceMonths
  return typeof override === 'number' && override > 0 ? override : CADENCE_DEFAULT_MONTHS
}

export type ReviewDueStatus = 'due' | 'soon' | 'ok' | 'n/a'

export interface ReviewDueState {
  status: ReviewDueStatus
  dueDate: Date | null
}

/**
 * The review-due state for an app's facility, evaluated at `now`. A review is only DUE on a LIVE facility:
 * the app must be DISBURSED (app.disbursedAt set — set at the 5→6 'Cair' transition) AND its own
 * facility (not closed). Otherwise 'n/a' (dueDate null) — an undisbursed / closed app has no cadence.
 *
 * dueDate = addMonths(disbursedAt, cadenceMonths). Status:
 *  • 'due'  when now ≥ dueDate
 *  • 'soon' within ~30 days before dueDate
 *  • 'ok'   otherwise (more than ~30 days out)
 *
 * PURE — reads ONLY dates (disbursedAt, now) + the cadence cascade; NEVER any payment/Kol/balance signal.
 */
export function reviewDueState(
  app: Pick<LoanApplication, 'id' | 'disbursedAt' | 'applicationStatus'>,
  customer: CadenceCustomer | null | undefined,
  now: Date,
): ReviewDueState {
  // Only a live, disbursed facility has a cadence. No anchor (undisbursed) or a closed app → 'n/a'.
  if (!app.disbursedAt || app.applicationStatus === 'closed') return { status: 'n/a', dueDate: null }
  const cadence = reviewCadenceMonths(app, customer)
  const dueDate = addMonths(app.disbursedAt, cadence)
  if (now.getTime() >= dueDate.getTime()) return { status: 'due', dueDate }
  const soonThreshold = dueDate.getTime() - SOON_WINDOW_DAYS * 86_400_000
  if (now.getTime() >= soonThreshold) return { status: 'soon', dueDate }
  return { status: 'ok', dueDate }
}
