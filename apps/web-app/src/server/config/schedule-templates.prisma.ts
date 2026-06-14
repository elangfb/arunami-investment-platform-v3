import 'server-only'
import { prisma } from '@/server/db'
import { parseScheduleTemplates } from '@/lib/config/schedule-template-input'
import type { ScheduleTemplateRow, MeetingScheduleTemplateVersionRow } from './schedule-templates'

export async function fetchScheduleRows(): Promise<ScheduleTemplateRow[]> {
  return prisma.meetingScheduleTemplateVersion.findMany({
    select: { version: true, effectiveFrom: true, templates: true },
  }) as Promise<ScheduleTemplateRow[]>
}

export async function fetchScheduleVersionRows(): Promise<MeetingScheduleTemplateVersionRow[]> {
  const rows = await prisma.meetingScheduleTemplateVersion.findMany({ orderBy: { version: 'desc' } })
  return rows.map((r) => ({
    version: r.version,
    templates: parseScheduleTemplates(r.templates),
    effectiveFrom: r.effectiveFrom,
    reason: r.reason ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }))
}
