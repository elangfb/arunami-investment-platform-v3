// Asia/Jakarta has NO DST (workflow-finetune.md §15.5 — the reason we chose a simple
// day-of-week + time model over RRULE). These tiny helpers format / extract weekday in the
// Jakarta zone via Intl so the materializer doesn't suffer the classic UTC-vs-local off-by-one.

import { BUNDLED_HOLIDAYS, type HolidayCalendar } from './holidays'

/** 'YYYY-MM-DD' for the given Date interpreted in Asia/Jakarta. */
export function ymdJakarta(d: Date): string {
  // en-CA locale → ISO YYYY-MM-DD shape.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Sun=0 … Sat=6 in Asia/Jakarta. */
export function dayOfWeekJakarta(d: Date): number {
  const wk = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(d)
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wk] ?? 0
}

// ── Business calendar (Asia/Jakarta) ─────────────────────────────────────────
// Hijra's SLA targets are in HK (hari kerja = business days), business hours 08:00–17:00,
// Mon–Fri. Jakarta has NO DST, so a fixed +07:00 offset is exact — we map each instant to a
// Jakarta "day number" and reason in integer days. Holidays ARE excluded: the `holidays` arg
// defaults to the BUNDLED national snapshot (holidays.ts) so every caller drops national
// holidays with no change; the server passes the admin-merged calendar where it matters.

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

/** Days since the Unix epoch as seen in Asia/Jakarta (epoch day 0 = 1970-01-01 Jakarta). */
function jakartaDayNumber(d: Date): number {
  return Math.floor((d.getTime() + JAKARTA_OFFSET_MS) / 86_400_000)
}

/** Weekday (Sun=0..Sat=6, matching dayOfWeekJakarta) for a Jakarta day number. */
function weekdayOfDayNumber(n: number): number {
  // 1970-01-01 (day 0) was a Thursday (=4).
  return (((n % 7) + 4) % 7 + 7) % 7
}

/** The Asia/Jakarta calendar date 'YYYY-MM-DD' for a Jakarta day number (midday instant of that day). */
function ymdOfDayNumber(n: number): string {
  return ymdJakarta(new Date(n * 86_400_000 - JAKARTA_OFFSET_MS + 43_200_000))
}

/** True if the instant's Asia/Jakarta calendar date is a holiday in `holidays` (default: bundled). */
export function isJakartaHoliday(d: Date, holidays: HolidayCalendar = BUNDLED_HOLIDAYS): boolean {
  return holidays.has(ymdJakarta(d))
}

/** True if the instant falls on a business day (Mon–Fri, non-holiday) in Asia/Jakarta. */
export function isBusinessDayJakarta(d: Date, holidays: HolidayCalendar = BUNDLED_HOLIDAYS): boolean {
  const wd = weekdayOfDayNumber(jakartaDayNumber(d))
  return wd >= 1 && wd <= 5 && !isJakartaHoliday(d, holidays)
}

/** Hour + minute of the instant in Asia/Jakarta (24h). */
export function jakartaHourMinute(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return { hour, minute }
}

/** Business hours = 08:00–17:00 Jakarta on a business day (non-holiday). Used for same-day-by-cutoff SLAs. */
export function isWithinBusinessHoursJakarta(d: Date, startHour = 8, endHour = 17, holidays: HolidayCalendar = BUNDLED_HOLIDAYS): boolean {
  if (!isBusinessDayJakarta(d, holidays)) return false
  const { hour } = jakartaHourMinute(d)
  return hour >= startHour && hour < endHour
}

/**
 * Business days elapsed since `start` (Asia/Jakarta), counting business-day boundaries crossed in
 * the half-open interval (start, now]. Same business day → 0; each later Mon–Fri adds 1; weekends
 * and holidays (`holidays`, default the bundled national snapshot) are skipped. After-hours work
 * does NOT add a day — elapsed only ticks on day boundaries, the correct HK semantics. SLA ranges
 * are small so the day-by-day count is exact and obviously correct.
 */
export function businessDaysElapsed(start: Date, now: Date = new Date(), holidays: HolidayCalendar = BUNDLED_HOLIDAYS): number {
  const s = jakartaDayNumber(start)
  const e = jakartaDayNumber(now)
  if (e <= s) return 0
  let count = 0
  for (let n = s + 1; n <= e; n++) {
    const wd = weekdayOfDayNumber(n)
    if (wd < 1 || wd > 5) continue // weekend
    if (holidays.has(ymdOfDayNumber(n))) continue // national / admin holiday
    count++
  }
  return count
}
