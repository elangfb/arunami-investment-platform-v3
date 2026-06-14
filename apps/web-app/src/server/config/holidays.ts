import 'server-only'

import { prisma } from '@/server/db'
import { resolveActiveVersion } from '@/lib/config/versioned'
import { BUNDLED_HOLIDAYS, mergeHolidayCalendar, type HolidayCalendar } from '@/lib/scheduling/holidays'
import { log, errField } from '@/server/log'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { configVersionDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import * as prismaImpl from './holidays.prisma'
import * as firestoreImpl from './holidays.firestore'

interface CreateHolidayOpts {
  added: readonly string[]
  removed: readonly string[]
  reason?: string
  createdBy: string
  effectiveFrom?: Date
}

// Admin holiday-calendar config + the public-holiday-API fetch (jakarta-holiday-calendar.md). The
// READERS (resolveHolidayCalendar/listHolidayCalendarVersions) are backend-routed; the pure
// merge/bundled live in lib/scheduling/holidays.ts. The WRITERS (createHolidayCalendarVersion,
// refreshHolidaysFromApi) stay Prisma-bound for now — admin-only, a documented firestore-mode gap.

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Minimal row for resolveActiveVersion (effectiveFrom MUST be a JS Date). */
export interface HolidayRow {
  version: number
  effectiveFrom: Date
  added: string[]
  removed: string[]
}

export interface HolidayCalendarVersionRow {
  version: number
  added: string[]
  removed: string[]
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

const fetchHolidayRows = dispatchRead(prismaImpl.fetchHolidayRows, firestoreImpl.fetchHolidayRows)
const fetchHolidayVersionRows = dispatchRead(prismaImpl.fetchHolidayVersionRows, firestoreImpl.fetchHolidayVersionRows)

/**
 * The effective holiday calendar at `at` = the BUNDLED national snapshot merged with the active admin
 * version's add/remove overrides (admin wins). Falls back to the bundled set — never throws.
 */
export async function resolveHolidayCalendar(at: Date = new Date()): Promise<HolidayCalendar> {
  const active = resolveActiveVersion(await fetchHolidayRows(), at)
  return active ? mergeHolidayCalendar(BUNDLED_HOLIDAYS, active.added, active.removed) : BUNDLED_HOLIDAYS
}

/** All override versions, newest first — for the admin tab's audit/history view. */
export async function listHolidayCalendarVersions(): Promise<HolidayCalendarVersionRow[]> {
  return fetchHolidayVersionRows()
}

// ── writers (Prisma-bound; admin-only; firestore-mode write gap is documented) ────────────────────

// Keep only well-formed 'YYYY-MM-DD' entries, deduped + sorted.
function sanitizeDates(dates: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const d of dates) {
    const t = d.trim()
    if (YMD.test(t)) seen.add(t)
  }
  return [...seen].sort()
}

/** Append a new versioned override set (append-only, backend-routed). version = max + 1. */
export const createHolidayCalendarVersion = dispatchWrite(
  'createHolidayCalendarVersion',
  async (input: CreateHolidayOpts) => {
    const max = await prisma.holidayCalendarVersion.aggregate({ _max: { version: true } })
    await prisma.holidayCalendarVersion.create({
      data: {
        version: (max._max.version ?? 0) + 1,
        added: sanitizeDates(input.added),
        removed: sanitizeDates(input.removed),
        effectiveFrom: input.effectiveFrom ?? new Date(),
        reason: input.reason?.trim() || null,
        createdBy: input.createdBy,
      },
    })
  },
  async (input: CreateHolidayOpts) => {
    await fsAllocateAndCreateVersion({
      collection: COL.config_holidayCalendar,
      docId: configVersionDocId,
      fields: { added: sanitizeDates(input.added), removed: sanitizeDates(input.removed) },
      effectiveFrom: input.effectiveFrom ?? new Date(),
      reason: input.reason?.trim() || null,
      createdBy: input.createdBy,
    })
  },
)

type FetchImpl = typeof fetch

/**
 * Best-effort fetch of Indonesian national holidays for `year` from the public Nager.Date API. Returns
 * the 'YYYY-MM-DD' list, or null on ANY failure so the caller keeps the prior/bundled calendar.
 */
export async function fetchNationalHolidays(year: number, fetchImpl: FetchImpl = fetch): Promise<string[] | null> {
  try {
    const res = await fetchImpl(`https://date.nager.at/api/v3/PublicHolidays/${year}/ID`)
    if (!res.ok) {
      log.warn('holidays.fetch_failed', { year, status: res.status })
      return null
    }
    const data: unknown = await res.json()
    if (!Array.isArray(data)) return null
    const dates: string[] = []
    for (const entry of data) {
      const d = (entry as { date?: unknown }).date
      if (typeof d === 'string' && YMD.test(d)) dates.push(d)
    }
    return dates.length ? sanitizeDates(dates) : null
  } catch (e) {
    log.warn('holidays.fetch_failed', { year, ...errField(e) })
    return null
  }
}

/**
 * Admin-triggered refresh: fetch `year` from the public API and append a new version. Best-effort —
 * on fetch failure NO version is written and it returns false.
 */
export async function refreshHolidaysFromApi(year: number, createdBy: string, fetchImpl: FetchImpl = fetch): Promise<boolean> {
  const fetched = await fetchNationalHolidays(year, fetchImpl)
  if (!fetched) return false
  const rows = await prisma.holidayCalendarVersion.findMany({ select: { version: true, effectiveFrom: true, added: true, removed: true } })
  const active = resolveActiveVersion(rows, new Date())
  await createHolidayCalendarVersion({
    added: [...(active?.added ?? []), ...fetched],
    removed: active?.removed ?? [],
    reason: `Auto-fetch hari libur nasional ${year} (Nager.Date)`,
    createdBy,
  })
  return true
}
