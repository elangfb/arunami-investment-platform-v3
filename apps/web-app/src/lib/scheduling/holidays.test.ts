import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUNDLED_HOLIDAYS, mergeHolidayCalendar } from './holidays'

// The bundled national snapshot + the pure merge that the admin-override resolver builds on.

test('BUNDLED_HOLIDAYS — carries the 2026 SKB national holidays', () => {
  assert.equal(BUNDLED_HOLIDAYS.has('2026-01-01'), true, 'Tahun Baru')
  assert.equal(BUNDLED_HOLIDAYS.has('2026-05-27'), true, 'Idul Adha')
  assert.equal(BUNDLED_HOLIDAYS.has('2026-08-17'), true, 'Kemerdekaan')
  assert.equal(BUNDLED_HOLIDAYS.has('2026-12-25'), true, 'Natal')
  assert.equal(BUNDLED_HOLIDAYS.has('2026-06-10'), false, 'an ordinary weekday is not a holiday')
})

test('mergeHolidayCalendar — base ∪ added − removed (admin wins on conflict)', () => {
  const merged = mergeHolidayCalendar(['2026-01-01', '2026-08-17'], ['2026-12-31'], ['2026-08-17'])
  assert.equal(merged.has('2026-01-01'), true, 'base kept')
  assert.equal(merged.has('2026-12-31'), true, 'admin-added kept')
  assert.equal(merged.has('2026-08-17'), false, 'admin-removed wins over a base entry')
})

test('mergeHolidayCalendar — removed wins even when also added (admin drop is authoritative)', () => {
  const merged = mergeHolidayCalendar(['2026-01-01'], ['2026-07-04'], ['2026-07-04'])
  assert.equal(merged.has('2026-07-04'), false)
})

test('mergeHolidayCalendar — empty overrides return the base unchanged', () => {
  const merged = mergeHolidayCalendar(BUNDLED_HOLIDAYS)
  assert.equal(merged.has('2026-01-01'), true)
  assert.equal(merged.size, BUNDLED_HOLIDAYS.size)
})
