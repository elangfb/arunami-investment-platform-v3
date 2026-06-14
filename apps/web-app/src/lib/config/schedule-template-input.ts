// Validator + parser for a meeting-schedule template (workflow-finetune.md §8). One template
// describes ONE recurring slot (e.g. "Tuesday 16:00 Ruang A, 2 slots, plafond ≥ 1B"). The
// daily auto-materializer (slice B) iterates the active templates + computes the next
// scheduledDate per day-of-week and upserts a `proposed` KomiteMeeting row.
//
// Pure module — no prisma / no server-only — so the admin form, the seeder, and the parser
// tests all share one validator.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/ // 24-hour HH:mm (Asia/Jakarta — no DST)

export interface ScheduleTemplateInput {
  /** Stable identity across versions ("tue-1600-roomA"). Used for the auto-materializer's
   *  idempotency key (sourceTemplateId, scheduledDate) on KomiteMeeting. */
  scheduleKey: string
  /** 0 = Sunday … 6 = Saturday (matches JS Date.getDay()). */
  dayOfWeek: number
  /** 'HH:mm' local Asia/Jakarta. */
  time: string
  room?: string | null
  meetingUrl?: string | null
  /** Committee members to populate as attendees on materialize. Must be non-empty. */
  attendeeUserIds: string[]
  /** Default chair — replaced/confirmed at human-confirm time if needed. Must be in attendees. */
  chairUserId: string
  /** Application slots per meeting. ≥1. */
  capacity: number
  /** Optional routing filter — applied by P2 auto-assign (slice B+). */
  routingFilter?: {
    minPlafond?: number
    maxPlafond?: number
    akadTypes?: string[]
  } | null
  notes?: string | null
}

export type MeetingScheduleTemplate = ScheduleTemplateInput

/** Throws on the first invalid field with an actionable message; returns a deep-cloned, trimmed
 *  template on success. Caller stores the result as one element of `templates: ScheduleTemplate[]`
 *  in the next MeetingScheduleTemplateVersion row. */
export function parseScheduleTemplate(raw: unknown): MeetingScheduleTemplate {
  const t = (raw ?? {}) as Partial<ScheduleTemplateInput>
  const key = (t.scheduleKey ?? '').toString().trim()
  if (!/^[a-z0-9_-]{2,40}$/i.test(key)) {
    throw new Error('scheduleKey: 2–40 karakter alfanumerik / underscore / hyphen.')
  }
  if (typeof t.dayOfWeek !== 'number' || !Number.isInteger(t.dayOfWeek) || t.dayOfWeek < 0 || t.dayOfWeek > 6) {
    throw new Error('dayOfWeek harus integer 0–6 (Minggu–Sabtu).')
  }
  const time = (t.time ?? '').toString().trim()
  if (!TIME_RE.test(time)) throw new Error('time harus format HH:mm (24-jam).')
  const attendees = Array.isArray(t.attendeeUserIds) ? t.attendeeUserIds.map(String).map((s) => s.trim()).filter(Boolean) : []
  if (!attendees.length) throw new Error('attendeeUserIds wajib ada ≥ 1.')
  const chair = (t.chairUserId ?? '').toString().trim()
  if (!chair) throw new Error('chairUserId wajib diisi.')
  if (!attendees.includes(chair)) throw new Error('chairUserId harus menjadi salah satu attendee.')
  if (typeof t.capacity !== 'number' || !Number.isInteger(t.capacity) || t.capacity < 1) {
    throw new Error('capacity harus integer ≥ 1.')
  }
  // routingFilter — every field optional; numeric bounds non-negative + min ≤ max.
  let routing: MeetingScheduleTemplate['routingFilter'] = null
  if (t.routingFilter && typeof t.routingFilter === 'object') {
    const rf = t.routingFilter
    const min = rf.minPlafond
    const max = rf.maxPlafond
    if (min != null && (!Number.isFinite(min) || min < 0)) throw new Error('routingFilter.minPlafond harus ≥ 0.')
    if (max != null && (!Number.isFinite(max) || max < 0)) throw new Error('routingFilter.maxPlafond harus ≥ 0.')
    if (min != null && max != null && min > max) throw new Error('routingFilter.minPlafond ≤ maxPlafond.')
    const akads = Array.isArray(rf.akadTypes) ? rf.akadTypes.map(String).filter(Boolean) : undefined
    routing = {
      ...(min != null ? { minPlafond: min } : {}),
      ...(max != null ? { maxPlafond: max } : {}),
      ...(akads && akads.length ? { akadTypes: akads } : {}),
    }
    if (!Object.keys(routing).length) routing = null
  }
  return {
    scheduleKey: key,
    dayOfWeek: t.dayOfWeek,
    time,
    room: t.room?.toString().trim() || null,
    meetingUrl: t.meetingUrl?.toString().trim() || null,
    attendeeUserIds: attendees,
    chairUserId: chair,
    capacity: t.capacity,
    routingFilter: routing,
    notes: t.notes?.toString().trim() || null,
  }
}

/** Validate + dedupe a full template list. Throws on the first invalid template + on duplicate
 *  scheduleKey collisions (the auto-materializer's idempotency key relies on uniqueness). */
export function parseScheduleTemplates(raw: unknown): MeetingScheduleTemplate[] {
  if (!Array.isArray(raw)) throw new Error('templates harus berupa array.')
  const out: MeetingScheduleTemplate[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const t = parseScheduleTemplate(item)
    if (seen.has(t.scheduleKey)) throw new Error(`Duplikat scheduleKey: ${t.scheduleKey}`)
    seen.add(t.scheduleKey)
    out.push(t)
  }
  return out
}
