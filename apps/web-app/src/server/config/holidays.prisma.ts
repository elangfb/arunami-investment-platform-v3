import 'server-only'
import { prisma } from '@/server/db'
import type { HolidayRow, HolidayCalendarVersionRow } from './holidays'

export async function fetchHolidayRows(): Promise<HolidayRow[]> {
  return prisma.holidayCalendarVersion.findMany({
    select: { version: true, effectiveFrom: true, added: true, removed: true },
  }) as Promise<HolidayRow[]>
}

export async function fetchHolidayVersionRows(): Promise<HolidayCalendarVersionRow[]> {
  return prisma.holidayCalendarVersion.findMany({ orderBy: { version: 'desc' } }) as Promise<HolidayCalendarVersionRow[]>
}
