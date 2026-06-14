import 'server-only'

import { resolveActiveVersion } from '@/lib/config/versioned'
import { parseScheduleTemplates, type MeetingScheduleTemplate } from '@/lib/config/schedule-template-input'
import { prisma } from '@/server/db'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { configVersionDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import * as prismaImpl from './schedule-templates.prisma'
import * as firestoreImpl from './schedule-templates.firestore'

interface AppendScheduleOpts {
  templates: MeetingScheduleTemplate[]
  effectiveFrom: Date
  reason: string | null
  createdBy: string
}

// Admin-configurable committee meeting-schedule templates (workflow-finetune.md §8). Backend-routed
// readers; resolveActiveVersion + the parse/validate are pure. appendMeetingScheduleTemplateVersion
// (writer) stays Prisma-bound (admin-only; documented firestore-mode write gap).

/** Minimal row for resolveActiveVersion (effectiveFrom MUST be a JS Date). */
export interface ScheduleTemplateRow {
  version: number
  effectiveFrom: Date
  templates: unknown
}

export interface MeetingScheduleTemplateVersionRow {
  version: number
  templates: MeetingScheduleTemplate[]
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

const fetchScheduleRows = dispatchRead(prismaImpl.fetchScheduleRows, firestoreImpl.fetchScheduleRows)
const fetchScheduleVersionRows = dispatchRead(prismaImpl.fetchScheduleVersionRows, firestoreImpl.fetchScheduleVersionRows)

/** Active schedule templates at `at`, or [] when none effective ("no auto-scheduling"). */
export async function getActiveScheduleTemplates(at: Date = new Date()): Promise<MeetingScheduleTemplate[]> {
  const active = resolveActiveVersion(await fetchScheduleRows(), at)
  if (!active) return []
  try {
    return parseScheduleTemplates(active.templates)
  } catch {
    return [] // a broken stored row must not crash the materializer
  }
}

export async function listMeetingScheduleTemplateVersions(): Promise<MeetingScheduleTemplateVersionRow[]> {
  return fetchScheduleVersionRows()
}

export const appendMeetingScheduleTemplateVersion = dispatchWrite(
  'appendMeetingScheduleTemplateVersion',
  async (opts: AppendScheduleOpts) => {
    await prisma.$transaction(async (tx) => {
      const max = await tx.meetingScheduleTemplateVersion.findFirst({ orderBy: { version: 'desc' }, select: { version: true } })
      await tx.meetingScheduleTemplateVersion.create({
        data: {
          version: (max?.version ?? 0) + 1,
          templates: opts.templates as unknown as object,
          effectiveFrom: opts.effectiveFrom,
          reason: opts.reason,
          createdBy: opts.createdBy,
        },
      })
    })
  },
  async (opts: AppendScheduleOpts) => {
    await fsAllocateAndCreateVersion({
      collection: COL.config_scheduleTemplate,
      docId: configVersionDocId,
      fields: { templates: opts.templates },
      effectiveFrom: opts.effectiveFrom,
      reason: opts.reason,
      createdBy: opts.createdBy,
    })
  },
)
