import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ymdJakarta,
  dayOfWeekJakarta,
  isBusinessDayJakarta,
  isJakartaHoliday,
  isWithinBusinessHoursJakarta,
  jakartaHourMinute,
  businessDaysElapsed,
} from './jakarta-clock'

test('ymdJakarta — formats in Asia/Jakarta (no DST), handles midnight UTC rollover', () => {
  // 2026-05-26 17:30Z = 2026-05-27 00:30 in Jakarta (UTC+7) — must roll the date forward.
  assert.equal(ymdJakarta(new Date('2026-05-26T17:30:00Z')), '2026-05-27')
  // 2026-05-26 16:00Z = 2026-05-26 23:00 Jakarta — same day.
  assert.equal(ymdJakarta(new Date('2026-05-26T16:00:00Z')), '2026-05-26')
})

test('dayOfWeekJakarta — Sun=0..Sat=6 in Jakarta', () => {
  // 2026-05-24 12:00Z = Sun 19:00 Jakarta.
  assert.equal(dayOfWeekJakarta(new Date('2026-05-24T12:00:00Z')), 0)
  // 2026-05-26 12:00Z = Tue 19:00 Jakarta.
  assert.equal(dayOfWeekJakarta(new Date('2026-05-26T12:00:00Z')), 2)
  // 2026-05-30 18:00Z = Sun 01:00 Jakarta (the next day in Jakarta).
  assert.equal(dayOfWeekJakarta(new Date('2026-05-30T18:00:00Z')), 0)
})

// Reference instants (UTC) → Jakarta wall-clock (UTC+7). Use a HOLIDAY-FREE June week for the
// baseline business-day counts (May 2026 has Idul Adha/cuti bersama/Pancasila — covered separately).
// 2026-06-08 is a Monday; June 2026 has no national holiday in the 8th–15th window.
const monAM = new Date('2026-06-08T02:00:00Z') // Mon 09:00 Jakarta
const tueAM = new Date('2026-06-09T02:00:00Z') // Tue 09:00
const friAM = new Date('2026-06-12T02:00:00Z') // Fri 09:00
const nextMonAM = new Date('2026-06-15T02:00:00Z') // Mon 09:00 (following week)

test('isBusinessDayJakarta — Mon–Fri true, weekend false (Jakarta zone, incl. midnight rollover)', () => {
  assert.equal(isBusinessDayJakarta(new Date('2026-05-26T12:00:00Z')), true) // Tue 19:00 Jakarta
  assert.equal(isBusinessDayJakarta(new Date('2026-05-24T12:00:00Z')), false) // Sun 19:00 Jakarta
  assert.equal(isBusinessDayJakarta(new Date('2026-05-30T02:00:00Z')), false) // Sat 09:00 Jakarta
  // 2026-05-30 18:00Z = Sun 01:00 Jakarta — the UTC date is Sat but Jakarta has rolled to Sun.
  assert.equal(isBusinessDayJakarta(new Date('2026-05-30T18:00:00Z')), false)
})

test('jakartaHourMinute / isWithinBusinessHoursJakarta — 08:00–17:00 window, cutoff override', () => {
  assert.deepEqual(jakartaHourMinute(new Date('2026-05-25T02:30:00Z')), { hour: 9, minute: 30 })
  assert.equal(isWithinBusinessHoursJakarta(monAM), true) // 09:00
  assert.equal(isWithinBusinessHoursJakarta(new Date('2026-05-25T10:00:00Z')), false) // 17:00 (end-exclusive)
  assert.equal(isWithinBusinessHoursJakarta(new Date('2026-05-25T00:30:00Z')), false) // 07:30
  assert.equal(isWithinBusinessHoursJakarta(new Date('2026-05-30T03:00:00Z')), false) // Sat 10:00
  // Ops Pencairan same-day cutoff 16:00 → custom endHour.
  assert.equal(isWithinBusinessHoursJakarta(new Date('2026-05-25T08:00:00Z'), 8, 16), true) // 15:00
  assert.equal(isWithinBusinessHoursJakarta(new Date('2026-05-25T09:00:00Z'), 8, 16), false) // 16:00
})

test('businessDaysElapsed — counts Mon–Fri boundaries, skips weekends, after-hours adds no day', () => {
  assert.equal(businessDaysElapsed(monAM, monAM), 0) // same instant
  assert.equal(businessDaysElapsed(monAM, tueAM), 1) // Mon → Tue
  assert.equal(businessDaysElapsed(friAM, nextMonAM), 1) // Fri → Mon skips Sat/Sun
  assert.equal(businessDaysElapsed(monAM, nextMonAM), 5) // Tue,Wed,Thu,Fri,Mon
  // weekend-only span → 0 business days.
  assert.equal(businessDaysElapsed(new Date('2026-05-30T02:00:00Z'), new Date('2026-05-31T02:00:00Z')), 0)
  // after-hours same business day → still 0 (only day boundaries tick).
  assert.equal(businessDaysElapsed(new Date('2026-05-25T09:00:00Z'), new Date('2026-05-25T13:00:00Z')), 0)
  // now before start → 0 (never negative).
  assert.equal(businessDaysElapsed(tueAM, monAM), 0)
})

test('businessDaysElapsed — excludes national holidays (bundled SKB 2026 calendar)', () => {
  // Wed 2026-05-27 (Idul Adha) + Thu 2026-05-28 (cuti bersama) fall between Tue 05-26 and Fri 05-29:
  // only Fri counts, not all three weekdays.
  assert.equal(businessDaysElapsed(new Date('2026-05-26T02:00:00Z'), new Date('2026-05-29T02:00:00Z')), 1)
  // A weekday national holiday is not a business day.
  assert.equal(isBusinessDayJakarta(new Date('2026-05-27T02:00:00Z')), false) // Idul Adha (Wed)
  assert.equal(isJakartaHoliday(new Date('2026-06-01T02:00:00Z')), true) // Pancasila (Mon)
  // Pancasila Mon 2026-06-01 excluded: Fri 05-29 → Mon 06-01 = 0 business days.
  assert.equal(businessDaysElapsed(new Date('2026-05-29T02:00:00Z'), new Date('2026-06-01T02:00:00Z')), 0)
})

test('businessDaysElapsed / isJakartaHoliday — honor an injected calendar (admin override)', () => {
  // A clean Tue counts by default, but is dropped when the injected calendar marks it a holiday.
  assert.equal(businessDaysElapsed(monAM, tueAM), 1)
  assert.equal(businessDaysElapsed(monAM, tueAM, new Set(['2026-06-09'])), 0)
  // An injected (empty) calendar drops the bundled national exclusion → the weekday counts again.
  assert.equal(isJakartaHoliday(new Date('2026-06-01T02:00:00Z'), new Set()), false)
})
