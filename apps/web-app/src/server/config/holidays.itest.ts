import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../db'
import {
  resolveHolidayCalendar,
  createHolidayCalendarVersion,
  listHolidayCalendarVersions,
  refreshHolidaysFromApi,
} from './holidays'

// Integration (real Postgres, *_test DB only): the admin holiday overrides + public-API refresh
// resolve into the merged calendar the SLA clock consumes, and an API failure never writes a version
// or throws (the bundled/last calendar stays).

async function clean(): Promise<void> {
  await prisma.holidayCalendarVersion.deleteMany({})
}
before(clean)
after(clean)
beforeEach(clean)

// A fake fetch returning the given holiday dates (Nager.Date shape).
function stubFetch(dates: string[]): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(dates.map((date) => ({ date, name: 'x' }))), { status: 200 })) as unknown as typeof fetch
}
const throwingFetch: typeof fetch = (async () => {
  throw new Error('network down')
}) as unknown as typeof fetch

test('no admin version → resolveHolidayCalendar is the bundled national snapshot', async () => {
  const cal = await resolveHolidayCalendar()
  assert.equal(cal.has('2026-08-17'), true, 'bundled Kemerdekaan present')
})

test('admin override merges: an added date appears; a removed bundled date is dropped (admin wins)', async () => {
  await createHolidayCalendarVersion({ added: ['2026-07-04'], removed: ['2026-08-17'], createdBy: 'admin' })
  const cal = await resolveHolidayCalendar()
  assert.equal(cal.has('2026-07-04'), true, 'admin-added bank holiday honored')
  assert.equal(cal.has('2026-08-17'), false, 'admin-removed bundled holiday dropped')
  assert.equal(cal.has('2026-01-01'), true, 'other bundled holidays remain')
})

test('refreshHolidaysFromApi — a successful fetch appends a version; the dates resolve', async () => {
  const ok = await refreshHolidaysFromApi(2027, 'admin', stubFetch(['2027-01-01', '2027-08-17']))
  assert.equal(ok, true)
  const cal = await resolveHolidayCalendar()
  assert.equal(cal.has('2027-01-01'), true)
  assert.equal((await listHolidayCalendarVersions()).length, 1)
})

test('refreshHolidaysFromApi — a fetch failure writes NO version and never throws (fallback to bundled)', async () => {
  const ok = await refreshHolidaysFromApi(2028, 'admin', throwingFetch)
  assert.equal(ok, false)
  assert.equal((await listHolidayCalendarVersions()).length, 0, 'no version written on API failure')
  // The SLA calendar still resolves (bundled) — no throw.
  assert.equal((await resolveHolidayCalendar()).has('2026-08-17'), true)
})

test('refreshHolidaysFromApi — preserves prior admin removes across an API refresh', async () => {
  await createHolidayCalendarVersion({ added: [], removed: ['2026-08-17'], createdBy: 'admin' })
  await refreshHolidaysFromApi(2027, 'admin', stubFetch(['2027-01-01']))
  const cal = await resolveHolidayCalendar()
  assert.equal(cal.has('2027-01-01'), true, 'fetched date added')
  assert.equal(cal.has('2026-08-17'), false, 'prior admin removal preserved through the refresh')
})
