import 'server-only'
import { cache } from 'react'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import type { KomiteMeeting, MeetingStatus } from '@/lib/types'

// Agenda + attendees live in join tables (MeetingAgendaItem / MeetingAttendee); the meeting
// read always includes them and rowToMeeting flattens them back to the domain string[] shape.
type MeetingRow = Prisma.KomiteMeetingGetPayload<{ include: { agendaItems: true; attendees: true } }>

const MEETING_INCLUDE = { agendaItems: true, attendees: true } satisfies Prisma.KomiteMeetingInclude

function rowToMeeting(row: MeetingRow): KomiteMeeting {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    room: row.room ?? undefined,
    meetingUrl: row.meetingUrl ?? undefined,
    agendaAppIds: row.agendaItems.map((i) => i.applicationId),
    agendaReasons: Object.fromEntries(
      row.agendaItems.flatMap((i) => (i.routingReason ? [[i.applicationId, i.routingReason] as const] : [])),
    ),
    attendeeUserIds: row.attendees.map((a) => a.userId),
    chairUserId: row.chairUserId,
    notes: row.notes ?? undefined,
    minutes: row.minutes ?? undefined,
    minutesRecordedAt: row.minutesRecordedAt ?? undefined,
    minutesRecordedBy: row.minutesRecordedBy ?? undefined,
    status: row.status as MeetingStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    sourceTemplateId: row.sourceTemplateId ?? undefined,
    scheduledDate: row.scheduledDate ?? undefined,
    slotCapacity: row.slotCapacity ?? undefined,
  }
}

export const listMeetings = cache(async (): Promise<KomiteMeeting[]> => {
  const rows = await prisma.komiteMeeting.findMany({
    include: MEETING_INCLUDE,
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  })
  return rows.map(rowToMeeting)
})

export const getMeeting = cache(async (id: string): Promise<KomiteMeeting | null> => {
  const row = await prisma.komiteMeeting.findUnique({ where: { id }, include: MEETING_INCLUDE })
  return row ? rowToMeeting(row) : null
})

// Transaction-scoped advisory-lock key that serializes meeting-id allocation (any constant,
// app-specific). Held only for the duration of the allocate+insert txn below.
const MEETING_ID_LOCK = 7272001

/// Next meeting id (MTG-YYYY-NNN) from the current global max. INTERNAL: must run inside the
/// advisory-locked transaction in createMeeting — calling it on its own re-introduces the
/// allocate-then-insert TOCTOU race (two schedulers/auto-materialize batches → same id).
async function nextMeetingId(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear()
  const rows = await tx.komiteMeeting.findMany({ select: { id: true } })
  const max = rows.reduce((m, r) => {
    const n = Number(r.id.split('-').pop())
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `MTG-${year}-${String(max + 1).padStart(3, '0')}`
}

/// Allocate the id AND insert atomically. A transaction-scoped advisory lock serializes
/// concurrent callers (manual scheduling + future auto-materialization) so the max+1 read and
/// the insert can't interleave into a duplicate id. The caller passes the meeting WITHOUT an id;
/// the allocated id is returned on the result.
export async function createMeeting(meeting: Omit<KomiteMeeting, 'id'>): Promise<KomiteMeeting> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEETING_ID_LOCK})`
    const id = await nextMeetingId(tx)
    await tx.komiteMeeting.create({
      data: {
        id,
        date: meeting.date,
        time: meeting.time,
        room: meeting.room ?? null,
        meetingUrl: meeting.meetingUrl ?? null,
        chairUserId: meeting.chairUserId,
        notes: meeting.notes ?? null,
        status: meeting.status,
        createdBy: meeting.createdBy,
        createdAt: meeting.createdAt,
        // Auto-materialization metadata (workflow-finetune.md §8). Manual createMeeting
        // leaves these undefined; the materializer fills them so (sourceTemplateId,
        // scheduledDate) makes its re-runs idempotent at the unique-index level.
        sourceTemplateId: meeting.sourceTemplateId ?? null,
        scheduledDate: meeting.scheduledDate ?? null,
        slotCapacity: meeting.slotCapacity ?? null,
        agendaItems: { create: meeting.agendaAppIds.map((applicationId) => ({ applicationId, routingReason: meeting.agendaReasons?.[applicationId] ?? null })) },
        attendees: { create: meeting.attendeeUserIds.map((userId) => ({ userId })) },
      },
    })
    return { ...meeting, id }
  })
}

export async function setMeetingStatus(id: string, status: MeetingStatus): Promise<KomiteMeeting> {
  const row = await prisma.komiteMeeting.update({ where: { id }, data: { status }, include: MEETING_INCLUDE })
  return rowToMeeting(row)
}

/// Record the minutes-of-meeting (MOM) for a completed meeting. Stamps recorder + time so the
/// ≤H+1 MOM SLA (meetingMomSlaState) stops. Authz is enforced at the action layer (chair-only).
export async function setMeetingMinutes(id: string, minutes: string, recordedBy: string): Promise<KomiteMeeting> {
  const row = await prisma.komiteMeeting.update({
    where: { id },
    data: { minutes, minutesRecordedBy: recordedBy, minutesRecordedAt: new Date() },
    include: MEETING_INCLUDE,
  })
  return rowToMeeting(row)
}

/// Reschedule a meeting (ADR-0005 #13). Authz + the signature-freeze guard live in the action layer.
export async function setMeetingSchedule(id: string, date: string, time: string): Promise<KomiteMeeting> {
  const row = await prisma.komiteMeeting.update({ where: { id }, data: { date, time }, include: MEETING_INCLUDE })
  return rowToMeeting(row)
}

/// Replace a meeting's attendee set (Batch 8 #19: RM corrects real attendance before the MoM is
/// signed, so no-show committee members don't deadlock the MoM). Whole-set replace in one txn.
/// Authz + the proposed/upcoming + signature-freeze + chair-still-present guards live in the action layer.
export async function setMeetingAttendees(id: string, attendeeUserIds: string[]): Promise<KomiteMeeting> {
  const row = await prisma.$transaction(async (tx) => {
    await tx.meetingAttendee.deleteMany({ where: { meetingId: id } })
    if (attendeeUserIds.length) {
      await tx.meetingAttendee.createMany({ data: attendeeUserIds.map((userId) => ({ meetingId: id, userId })) })
    }
    return tx.komiteMeeting.findUniqueOrThrow({ where: { id }, include: MEETING_INCLUDE })
  })
  return rowToMeeting(row)
}

/// True once ANY application on the meeting's agenda has a MoM signature — the point at which the
/// meeting time freezes (#13: a signed MoM fixes the recorded meeting time).
export async function meetingHasMomSignatures(meetingId: string): Promise<boolean> {
  const agenda = await prisma.meetingAgendaItem.findMany({ where: { meetingId }, select: { applicationId: true } })
  if (agenda.length === 0) return false
  const count = await prisma.approvalStep.count({
    where: { applicationId: { in: agenda.map((a) => a.applicationId) }, chain: 'mom' },
  })
  return count > 0
}

/// Mark the meeting carrying `appId` completed once every app on its agenda has been DECIDED and
/// ROUTED off the committee stage (ADR-0005: an outcome is recorded before the MoM is signed, so
/// `komiteDecision != null` alone is premature — the app leaving Stage 5 is the real signal).
export async function completeMeetingIfAllDecided(appId: string): Promise<void> {
  const carrier = await prisma.meetingAgendaItem.findFirst({
    where: { applicationId: appId, meeting: { status: 'upcoming' } },
    select: { meetingId: true },
  })
  if (!carrier) return
  const agenda = await prisma.meetingAgendaItem.findMany({
    where: { meetingId: carrier.meetingId },
    select: { applicationId: true },
  })
  const routed = await prisma.application.count({
    where: { id: { in: agenda.map((item) => item.applicationId) }, stage: { not: 5 } },
  })
  if (routed === agenda.length) {
    await prisma.komiteMeeting.update({ where: { id: carrier.meetingId }, data: { status: 'completed' } })
  }
}
