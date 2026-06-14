import 'server-only'
import { COL } from '@/server/firebase/collections'
import { fetchVersionedConfigDocs } from './versioned-firestore'
import type { HolidayRow, HolidayCalendarVersionRow } from './holidays'

export async function fetchHolidayRows(): Promise<HolidayRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_holidayCalendar)
  return rows.map((d) => ({
    version: d.version as number,
    effectiveFrom: d.effectiveFrom as Date,
    added: (d.added as string[]) ?? [],
    removed: (d.removed as string[]) ?? [],
  }))
}

export async function fetchHolidayVersionRows(): Promise<HolidayCalendarVersionRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_holidayCalendar)
  return rows
    .map((d) => ({
      version: d.version as number,
      added: (d.added as string[]) ?? [],
      removed: (d.removed as string[]) ?? [],
      effectiveFrom: d.effectiveFrom as Date,
      reason: (d.reason as string | null | undefined) ?? null,
      createdBy: d.createdBy as string,
      createdAt: d.createdAt as Date,
    }))
    .sort((a, b) => b.version - a.version)
}
