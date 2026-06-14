import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths,
  reviewCadenceMonths,
  reviewDueState,
  CADENCE_DEFAULT_MONTHS,
} from './review-cadence'
import { buildReviewDueNotifications, type ReviewDueNotice } from './notifications'

// PURE review-cadence math + the derived notification shape (RM-led redesign §7 / Topic 7). These lock
// the calendar-month math, the cascade default, and the due/soon/ok/n-a thresholds a reader reasons
// about. The server resolver (server/notifications/review-due-notices.ts) is covered by typecheck + the
// itests; here we prove the pure layer. INVARIANT: reviewDueState reads only DATES, never payment/Kol.

// ── addMonths: calendar months with end-of-month clamp ──────────────────────
test('addMonths adds calendar months', () => {
  assert.equal(addMonths(new Date('2026-01-15T00:00:00Z'), 12).getFullYear(), 2027)
  const r = addMonths(new Date('2026-03-10T00:00:00'), 1)
  assert.equal(r.getMonth(), 3) // April (0-based)
  assert.equal(r.getDate(), 10)
})

test('addMonths clamps to end-of-month (Jan 31 + 1 → Feb 28/29, not Mar)', () => {
  const leap = addMonths(new Date(2024, 0, 31), 1) // 2024 is a leap year
  assert.equal(leap.getMonth(), 1) // February
  assert.equal(leap.getDate(), 29)
  const nonLeap = addMonths(new Date(2026, 0, 31), 1)
  assert.equal(nonLeap.getMonth(), 1) // February
  assert.equal(nonLeap.getDate(), 28)
  // Oct 31 + 12 (default cadence) → Oct 31 next year (no clamp needed).
  const year = addMonths(new Date(2026, 9, 31), 12)
  assert.equal(year.getFullYear(), 2027)
  assert.equal(year.getMonth(), 9)
  assert.equal(year.getDate(), 31)
})

test('addMonths does not mutate its input', () => {
  const src = new Date(2026, 0, 15)
  const before = src.getTime()
  addMonths(src, 6)
  assert.equal(src.getTime(), before)
})

// ── reviewCadenceMonths: Nasabah override → 12 default ──────────────────────
test('reviewCadenceMonths: override wins, else default 12', () => {
  assert.equal(reviewCadenceMonths({ id: 'a' }, { reviewCadenceMonths: 6 }), 6)
  assert.equal(reviewCadenceMonths({ id: 'a' }, { reviewCadenceMonths: null }), CADENCE_DEFAULT_MONTHS)
  assert.equal(reviewCadenceMonths({ id: 'a' }, null), CADENCE_DEFAULT_MONTHS)
  assert.equal(reviewCadenceMonths({ id: 'a' }, undefined), CADENCE_DEFAULT_MONTHS)
  // Invalid (non-positive) override falls back to default.
  assert.equal(reviewCadenceMonths({ id: 'a' }, { reviewCadenceMonths: 0 }), CADENCE_DEFAULT_MONTHS)
})

// ── reviewDueState: due / soon / ok / n-a ───────────────────────────────────
const disbursed = (over: Partial<{ disbursedAt: Date | null; applicationStatus: 'active' | 'closed' }> = {}) => ({
  id: 'FOS-001',
  disbursedAt: new Date('2025-06-01T00:00:00Z'),
  applicationStatus: 'active' as const,
  ...over,
})

test("reviewDueState 'n/a' when undisbursed or closed (no live facility, no cadence)", () => {
  assert.equal(reviewDueState(disbursed({ disbursedAt: null }), null, new Date()).status, 'n/a')
  assert.equal(reviewDueState(disbursed({ applicationStatus: 'closed' }), null, new Date()).status, 'n/a')
  assert.deepEqual(reviewDueState(disbursed({ disbursedAt: null }), null, new Date()).dueDate, null)
})

test("reviewDueState 'due' when now ≥ dueDate (12-month default)", () => {
  // Disbursed 2025-06-01, default 12mo → due 2026-06-01. now after that → due.
  const s = reviewDueState(disbursed(), null, new Date('2026-07-01T00:00:00Z'))
  assert.equal(s.status, 'due')
  assert.equal(s.dueDate?.getUTCFullYear(), 2026)
})

test("reviewDueState 'soon' within ~30 days before dueDate", () => {
  // due 2026-06-01; 20 days before → soon.
  const s = reviewDueState(disbursed(), null, new Date('2026-05-12T00:00:00Z'))
  assert.equal(s.status, 'soon')
})

test("reviewDueState 'ok' when more than ~30 days out", () => {
  const s = reviewDueState(disbursed(), null, new Date('2026-01-01T00:00:00Z'))
  assert.equal(s.status, 'ok')
})

test('reviewDueState respects the Nasabah cadence override (6mo brings the due date forward)', () => {
  // override 6mo → due 2025-12-01; a date past that is 'due' even though the 12mo default would be 'ok'.
  const at = new Date('2026-01-01T00:00:00Z')
  assert.equal(reviewDueState(disbursed(), { reviewCadenceMonths: 6 }, at).status, 'due')
  assert.equal(reviewDueState(disbursed(), null, at).status, 'ok')
})

// ── buildReviewDueNotifications: derived shape ──────────────────────────────
test('buildReviewDueNotifications maps one warning item per notice, keyed by appId', () => {
  const notices: ReviewDueNotice[] = [
    { appId: 'FOS-001', nasabahName: 'Budi', status: 'due', dueDate: new Date('2026-06-01T00:00:00Z') },
    { appId: 'FOS-002', nasabahName: 'PT Maju', status: 'soon', dueDate: new Date('2026-07-01T00:00:00Z') },
  ]
  const items = buildReviewDueNotifications(notices)
  assert.equal(items.length, 2)
  assert.equal(items[0].id, 'FOS-001-review')
  assert.equal(items[0].category, 'review')
  assert.equal(items[0].severity, 'warning')
  assert.equal(items[0].cta, 'Mulai review')
  assert.match(items[0].href, /\/applications\/FOS-001/)
  assert.match(items[0].title, /jatuh tempo/)
  assert.match(items[1].title, /mendekati/)
})
