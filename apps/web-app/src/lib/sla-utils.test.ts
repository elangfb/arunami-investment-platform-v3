import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSLAStatus, getDaysRemaining, getSLALabel, deskSlaState, SLA_TARGETS_DAYS, formatTanggal } from './sla-utils'

// SLA status keys off days-in-stage vs the target. Phase A made the target configurable:
// these assert the optional `targetDays` override (the config-resolved value) takes effect,
// and that omitting it falls back to the code constant (behavior-preserving).

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

test('getSLAStatus — uses the provided targetDays over the constant', () => {
  // Stage 1 constant is 3 days. Entered 4 days ago → overdue under the constant…
  assert.equal(getSLAStatus(1, daysAgo(4)), 'overdue')
  // …but normal if config widened the target to 10.
  assert.equal(getSLAStatus(1, daysAgo(4), 10), 'normal')
  // …and overdue if config tightened it to 2.
  assert.equal(getSLAStatus(1, daysAgo(4), 2), 'overdue')
})

test('getSLAStatus — at_risk within one day of the (configured) target', () => {
  assert.equal(getSLAStatus(1, daysAgo(5), 6), 'at_risk') // 5 elapsed, target 6 → within 1
  assert.equal(getSLAStatus(1, daysAgo(2), 6), 'normal')
})

test('getDaysRemaining — relative to the configured target', () => {
  assert.equal(getDaysRemaining(1, daysAgo(1), 5), 4)
  assert.equal(getDaysRemaining(1, daysAgo(1)), SLA_TARGETS_DAYS[1] - 1) // fallback to constant
})

test('getSLALabel — overdue/at_risk/remaining text honors the configured target', () => {
  assert.match(getSLALabel(1, daysAgo(8), 5), /Terlambat 3 hari/)
  assert.equal(getSLALabel(1, daysAgo(5), 6), '< 1 hari')
  assert.match(getSLALabel(1, daysAgo(1), 5), /4 hari tersisa/)
})

// Per-desk SLA: business-day (HK) aware, additive over per-stage (null when no desk target).
const mon = new Date('2026-06-08T02:00:00Z') // Mon 09:00 Jakarta (holiday-free June week)

test('deskSlaState — null when the desk has no configured target (falls back to per-stage)', () => {
  assert.equal(deskSlaState('muap-author', mon, { 'legal': 2 }, mon), null)
})

test('deskSlaState — HK thresholds: normal → at_risk (≤1 HK) → overdue (past target)', () => {
  const targets = { 'legal': 2 } as const
  assert.equal(deskSlaState('legal', mon, targets, new Date('2026-06-08T06:00:00Z'))?.status, 'normal') // 0 HK (same day)
  assert.equal(deskSlaState('legal', mon, targets, new Date('2026-06-10T02:00:00Z'))?.status, 'at_risk') // 2 HK (Tue,Wed)
  const od = deskSlaState('legal', mon, targets, new Date('2026-06-11T02:00:00Z')) // 3 HK (Tue,Wed,Thu)
  assert.equal(od?.status, 'overdue')
  assert.match(od!.label, /Terlambat 1 HK/)
})

test('deskSlaState — counts business days only (weekend does not burn the SLA)', () => {
  // Fri 09:00 → next Mon 09:00 is 3 calendar days but only 1 HK (holiday-free June dates).
  const r = deskSlaState('legal', new Date('2026-06-12T02:00:00Z'), { 'legal': 1 }, new Date('2026-06-15T02:00:00Z'))
  assert.equal(r?.elapsedBusinessDays, 1)
  assert.equal(r?.status, 'at_risk') // 1 HK elapsed vs 1 HK target → within
})

test('formatTanggal — compact id-ID date (DD Mon YYYY)', () => {
  // Construct from explicit Y/M/D (local time) so the calendar date is unambiguous.
  assert.equal(formatTanggal(new Date(2026, 5, 7)), '07 Jun 2026') // month is 0-indexed → June
  assert.equal(formatTanggal(new Date(2026, 0, 31)), '31 Jan 2026')
})
