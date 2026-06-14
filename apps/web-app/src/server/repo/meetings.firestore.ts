import 'server-only'
import { FieldValue, type Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore'
import type { KomiteMeeting, MeetingStatus } from '@/lib/types'
import { getDb } from '@/server/firebase/firestore'
import { COL, IDX, SUB, appRef } from '@/server/firebase/collections'
import { toDate, tsFromDate } from '@/server/firebase/timestamps'
import { meetingId as makeMeetingId, meetingTemplateSlotId } from './doc-ids'
import { DuplicateMeetingSlotError, NotFoundError, isAlreadyExists } from './errors'

// Firestore impl of the committee-meeting repo — parity with meetings.prisma.ts. Agenda/attendees
// are denormalized onto the meeting doc (agendaAppIds[] + agendaReasons map + attendeeUserIds[]);
// meeting-id is counter-allocated in a transaction (replaces pg_advisory_xact_lock). Mutators use
// tx.update (partial) so they NEVER drop agendaAppIds/agendaReasons (critique #15) and optional
// fields are written as undefined→absent (read back as undefined, NOT null — critique #22).

type Data = Record<string, unknown>

function docToMeeting(s: DocumentSnapshot): KomiteMeeting {
  const d = (s.data() ?? {}) as Data
  return {
    id: (d.id as string | undefined) ?? s.id,
    date: d.date as string,
    time: d.time as string,
    room: (d.room as string | undefined) ?? undefined,
    meetingUrl: (d.meetingUrl as string | undefined) ?? undefined,
    agendaAppIds: (d.agendaAppIds as string[] | undefined) ?? [],
    agendaReasons: (d.agendaReasons as Record<string, string> | undefined) ?? {},
    attendeeUserIds: (d.attendeeUserIds as string[] | undefined) ?? [],
    chairUserId: d.chairUserId as string,
    notes: (d.notes as string | undefined) ?? undefined,
    minutes: (d.minutes as string | undefined) ?? undefined,
    minutesRecordedAt: toDate(d.minutesRecordedAt as Timestamp | undefined) ?? undefined,
    minutesRecordedBy: (d.minutesRecordedBy as string | undefined) ?? undefined,
    status: d.status as MeetingStatus,
    createdBy: d.createdBy as string,
    createdAt: toDate(d.createdAt as Timestamp | undefined) ?? new Date(0),
    sourceTemplateId: (d.sourceTemplateId as string | undefined) ?? undefined,
    scheduledDate: toDate(d.scheduledDate as Timestamp | undefined) ?? undefined,
    slotCapacity: (d.slotCapacity as number | undefined) ?? undefined,
  }
}

export async function listMeetings(): Promise<KomiteMeeting[]> {
  const snap = await getDb().collection(COL.meetings).orderBy('date', 'asc').orderBy('time', 'asc').get()
  return snap.docs.map(docToMeeting)
}

export async function getMeeting(id: string): Promise<KomiteMeeting | null> {
  const s = await getDb().collection(COL.meetings).doc(id).get()
  return s.exists ? docToMeeting(s) : null
}

// Allocate the id (counters/meetingId-YYYY incremented in a tx) AND create atomically — replaces the
// pg advisory lock + max-scan. Per-year numbering (documented improvement over the legacy global max).
// MATERIALIZER IDEMPOTENCY: when the meeting carries a (sourceTemplateId, scheduledDate) slot, an
// index_meetingTemplateSlot doc is created in the SAME tx — the Firestore analog of the Prisma
// @@unique([sourceTemplateId, scheduledDate]). A re-run (or concurrent run) for an already-booked
// slot throws DuplicateMeetingSlotError instead of double-booking. Manual meetings (no template)
// have no slot and are never deduped.
export async function createMeeting(meeting: Omit<KomiteMeeting, 'id'>): Promise<KomiteMeeting> {
  const db = getDb()
  const year = new Date().getFullYear()
  const counterRef = db.collection(COL.counters).doc(`meetingId-${year}`)
  const slotRef =
    meeting.sourceTemplateId && meeting.scheduledDate
      ? db.collection(IDX.meetingTemplateSlot).doc(meetingTemplateSlotId(meeting.sourceTemplateId, meeting.scheduledDate))
      : null
  try {
    const id = await db.runTransaction(async (tx) => {
      // reads-before-writes: probe the slot, then the counter, BEFORE any write.
      if (slotRef && (await tx.get(slotRef)).exists) throw new DuplicateMeetingSlotError(slotRef.id)
      const cSnap = await tx.get(counterRef)
      const next = ((cSnap.exists ? (cSnap.data() as Data).next as number : 0) ?? 0) + 1
      const mid = makeMeetingId(year, next)
      tx.set(counterRef, { next }, { merge: true })
      tx.create(db.collection(COL.meetings).doc(mid), {
        id: mid,
        date: meeting.date,
        time: meeting.time,
        room: meeting.room,
        meetingUrl: meeting.meetingUrl,
        chairUserId: meeting.chairUserId,
        notes: meeting.notes,
        status: meeting.status,
        createdBy: meeting.createdBy,
        createdAt: tsFromDate(meeting.createdAt),
        sourceTemplateId: meeting.sourceTemplateId,
        scheduledDate: tsFromDate(meeting.scheduledDate),
        slotCapacity: meeting.slotCapacity,
        agendaAppIds: meeting.agendaAppIds,
        agendaReasons: meeting.agendaReasons ?? {},
        attendeeUserIds: meeting.attendeeUserIds,
      })
      // tx.create is the hard backstop: if the slot appeared between our read and commit, the
      // read-lock forces a retry whose probe sees it; a residual ALREADY_EXISTS is mapped below.
      if (slotRef) tx.create(slotRef, { meetingId: mid, templateId: meeting.sourceTemplateId, scheduledDate: tsFromDate(meeting.scheduledDate) })
      return mid
    })
    return { ...meeting, id }
  } catch (e) {
    if (slotRef && isAlreadyExists(e)) throw new DuplicateMeetingSlotError(slotRef.id)
    throw e
  }
}

async function updateAndRead(id: string, data: Data): Promise<KomiteMeeting> {
  const ref = getDb().collection(COL.meetings).doc(id)
  await ref.update(data) // partial update — preserves agendaAppIds/agendaReasons/attendeeUserIds
  const s = await ref.get()
  if (!s.exists) throw new NotFoundError(`meeting ${id}`)
  return docToMeeting(s)
}

export async function setMeetingStatus(id: string, status: MeetingStatus): Promise<KomiteMeeting> {
  return updateAndRead(id, { status })
}

export async function setMeetingMinutes(id: string, minutes: string, recordedBy: string): Promise<KomiteMeeting> {
  return updateAndRead(id, { minutes, minutesRecordedBy: recordedBy, minutesRecordedAt: FieldValue.serverTimestamp() })
}

export async function setMeetingSchedule(id: string, date: string, time: string): Promise<KomiteMeeting> {
  return updateAndRead(id, { date, time })
}

export async function setMeetingAttendees(id: string, attendeeUserIds: string[]): Promise<KomiteMeeting> {
  return updateAndRead(id, { attendeeUserIds })
}

// True once ANY application on the meeting's agenda has a MoM signature (approvalSteps chain='mom').
export async function meetingHasMomSignatures(meetingId: string): Promise<boolean> {
  const db = getDb()
  const m = await db.collection(COL.meetings).doc(meetingId).get()
  if (!m.exists) return false
  const agenda = ((m.data() as Data).agendaAppIds as string[] | undefined) ?? []
  for (const appId of agenda) {
    const sig = await appRef(db, appId).collection(SUB.approvalSteps).where('chain', '==', 'mom').limit(1).get()
    if (!sig.empty) return true
  }
  return false
}

// Mark the meeting carrying `appId` completed once every agenda app has left stage 5 (ADR-0005).
export async function completeMeetingIfAllDecided(appId: string): Promise<void> {
  const db = getDb()
  const carrierSnap = await db
    .collection(COL.meetings)
    .where('status', '==', 'upcoming')
    .where('agendaAppIds', 'array-contains', appId)
    .limit(1)
    .get()
  if (carrierSnap.empty) return
  const carrier = carrierSnap.docs[0]
  const agenda = ((carrier.data() as Data).agendaAppIds as string[] | undefined) ?? []
  if (agenda.length === 0) {
    await carrier.ref.update({ status: 'completed' })
    return
  }
  const appSnaps = await db.getAll(...agenda.map((id) => appRef(db, id)))
  const routed = appSnaps.filter((s) => s.exists && ((s.data() as Data).stage as number) !== 5).length
  if (routed === agenda.length) await carrier.ref.update({ status: 'completed' })
}
