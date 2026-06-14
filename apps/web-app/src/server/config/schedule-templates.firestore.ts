import 'server-only'
import { COL } from '@/server/firebase/collections'
import { parseScheduleTemplates } from '@/lib/config/schedule-template-input'
import { fetchVersionedConfigDocs } from './versioned-firestore'
import type { ScheduleTemplateRow, MeetingScheduleTemplateVersionRow } from './schedule-templates'

export async function fetchScheduleRows(): Promise<ScheduleTemplateRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_scheduleTemplate)
  return rows.map((d) => ({ version: d.version as number, effectiveFrom: d.effectiveFrom as Date, templates: d.templates }))
}

export async function fetchScheduleVersionRows(): Promise<MeetingScheduleTemplateVersionRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_scheduleTemplate)
  return rows
    .map((d) => ({
      version: d.version as number,
      templates: parseScheduleTemplates(d.templates),
      effectiveFrom: d.effectiveFrom as Date,
      reason: (d.reason as string | null | undefined) ?? null,
      createdBy: d.createdBy as string,
      createdAt: d.createdAt as Date,
    }))
    .sort((a, b) => b.version - a.version)
}
