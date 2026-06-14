import 'server-only'

import { createMeeting } from '@/server/repo/meetings'
import { listUnscheduledCommitteeCandidates } from '@/server/repo/applications'
import { isDuplicateSlotError } from '@/server/scheduling/duplicate-slot'
import { log, errField } from '@/server/log'
import { ymdJakarta, dayOfWeekJakarta } from '@/lib/scheduling/jakarta-clock'
import type { MeetingScheduleTemplate } from '@/lib/config/schedule-template-input'

// Daily materializer (workflow-finetune.md §8). Given a target calendar date + active
// templates, upsert ONE KomiteMeeting per matching template with status='proposed', attendees,
// chair, capacity, and a P2 proposed agenda selected by routingFilter. Human CM confirmation is
// still required before voting. The DB-level UNIQUE (sourceTemplateId, scheduledDate) makes re-runs
// (and concurrent runs) IDEMPOTENT: a duplicate
// insert hits P2002 and is counted as `skipped` rather than crashing the worker.
//
// Time-zone helpers live in lib/scheduling/jakarta-clock so the date logic is hermetically
// testable without dragging the prisma / server-only graph.

export interface MaterializeResult {
  created: { meetingId: string; scheduleKey: string; scheduledDate: string; agendaCount: number }[]
  skipped: { scheduleKey: string; reason: 'duplicate' | 'wrong-day' }[]
}

function matchesRoutingFilter(app: { requestedPlafond: number; akadType: string }, t: MeetingScheduleTemplate): boolean {
  const rf = t.routingFilter
  if (!rf) return true
  const plafond = app.requestedPlafond
  if (rf.minPlafond != null && plafond < rf.minPlafond) return false
  if (rf.maxPlafond != null && plafond > rf.maxPlafond) return false
  if (rf.akadTypes?.length && !(rf.akadTypes as readonly string[]).includes(app.akadType)) return false
  return true
}

function routingReason(app: { requestedPlafond: number; akadType: string }, t: MeetingScheduleTemplate): string {
  const parts = [`match slot ${t.scheduleKey}`]
  if (t.routingFilter?.minPlafond != null) parts.push(`plafond ≥ ${t.routingFilter.minPlafond.toLocaleString('id-ID')}`)
  if (t.routingFilter?.maxPlafond != null) parts.push(`plafond ≤ ${t.routingFilter.maxPlafond.toLocaleString('id-ID')}`)
  if (t.routingFilter?.akadTypes?.length) parts.push(`akad ${t.routingFilter.akadTypes.join('/')}`)
  parts.push(`nilai ${Number(app.requestedPlafond).toLocaleString('id-ID')} · ${app.akadType}`)
  return parts.join('; ')
}

async function selectProposedAgenda(t: MeetingScheduleTemplate, assignedInRun: Set<string>) {
  // Backend-agnostic candidate pool (stage-5, not rejected, undecided, not already on a
  // proposed/upcoming agenda), pre-ordered (enteredStageAt asc, id asc) by the repo. Re-read per
  // template so meetings created by EARLIER templates in this run are already excluded.
  const rows = await listUnscheduledCommitteeCandidates()
  const picked = rows
    .filter((app) => !assignedInRun.has(app.id))
    .filter((app) => matchesRoutingFilter(app, t))
    .slice(0, t.capacity)
  return {
    agendaAppIds: picked.map((app) => app.id),
    agendaReasons: Object.fromEntries(picked.map((app) => [app.id, routingReason(app, t)])),
  }
}

/** Materialize proposed meetings for ONE target date. Idempotent at the DB constraint level. */
export async function materializeMeetingsFor(
  targetDate: Date,
  templates: MeetingScheduleTemplate[],
  opts: { createdBy: string },
): Promise<MaterializeResult> {
  const out: MaterializeResult = { created: [], skipped: [] }
  const dow = dayOfWeekJakarta(targetDate)
  const dateStr = ymdJakarta(targetDate)
  // Anchor scheduledDate at midnight UTC of the target's Jakarta date — stable storage key.
  const scheduledDate = new Date(`${dateStr}T00:00:00Z`)
  const assignedInRun = new Set<string>()

  for (const t of templates) {
    if (t.dayOfWeek !== dow) {
      out.skipped.push({ scheduleKey: t.scheduleKey, reason: 'wrong-day' })
      continue
    }
    try {
      const proposedAgenda = await selectProposedAgenda(t, assignedInRun)
      const meeting = await createMeeting({
        date: dateStr,
        time: t.time,
        room: t.room ?? undefined,
        meetingUrl: t.meetingUrl ?? undefined,
        agendaAppIds: proposedAgenda.agendaAppIds,
        agendaReasons: proposedAgenda.agendaReasons,
        attendeeUserIds: t.attendeeUserIds,
        chairUserId: t.chairUserId,
        notes: t.notes ?? undefined,
        status: 'proposed',
        createdBy: opts.createdBy,
        createdAt: new Date(),
        sourceTemplateId: t.scheduleKey,
        scheduledDate,
        slotCapacity: t.capacity,
      })
      meeting.agendaAppIds.forEach((id) => assignedInRun.add(id))
      out.created.push({ meetingId: meeting.id, scheduleKey: t.scheduleKey, scheduledDate: dateStr, agendaCount: meeting.agendaAppIds.length })
    } catch (e) {
      // Slot already materialized for (sourceTemplateId, scheduledDate) — idempotency win. Both
      // backends surface this (Firestore DuplicateMeetingSlotError / Prisma P2002); see duplicate-slot.
      if (isDuplicateSlotError(e)) {
        out.skipped.push({ scheduleKey: t.scheduleKey, reason: 'duplicate' })
        continue
      }
      // Any other failure: log + skip this template, KEEP the loop running. A bad template
      // shouldn't poison the rest of the week's materialization.
      log.warn('materialize.create_failed', { scheduleKey: t.scheduleKey, ...errField(e) })
    }
  }
  return out
}

/** Roll the materializer forward `daysAhead` days from `from` (inclusive of `from`).
 *  Aggregates per-day results so the daily cron / admin trigger get one summary. */
export async function materializeMeetingsAhead(
  from: Date,
  daysAhead: number,
  templates: MeetingScheduleTemplate[],
  opts: { createdBy: string },
): Promise<MaterializeResult> {
  const agg: MaterializeResult = { created: [], skipped: [] }
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000)
    const r = await materializeMeetingsFor(d, templates, opts)
    agg.created.push(...r.created)
    agg.skipped.push(...r.skipped)
  }
  return agg
}
