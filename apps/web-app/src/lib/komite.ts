import { USERS } from '@/lib/seed-data/users'
import type { StatusTone } from '@/components/shared/StatusChip'
import type { KomiteMeeting, KomiteVoteValue, MeetingStatus, SLAStatus, User } from '@/lib/types'
import { businessDaysElapsed } from '@/lib/scheduling/jakarta-clock'
import type { HolidayCalendar } from '@/lib/scheduling/holidays'

// Single source of truth for committee decision presentation + the Rapat Komite signed-MoM rules
// (ADR-0005 — no in-app voting), shared by the Ruang Komite + the agenda surface so they never drift.

// Decision/vote vocabulary — English verbs (Approve / Conditional / Reject) for
// user familiarity; a deliberate, intentional exception to the Bahasa-only rule.
// The committee's recorded decision, a member's vote, and the risk recommendation
// all share these three verbs, so they're defined once here and never drift.
export const decisionLabel: Record<KomiteVoteValue, string> = {
  approve: 'Approve',
  conditional: 'Conditional',
  reject: 'Reject',
}
// A member's vote reads with the same three verbs as the recorded decision.
export const voteLabels: Record<KomiteVoteValue, string> = decisionLabel

// Semantic status tone for a decision/vote — feeds the shared StatusChip (colour
// + shape-distinct icon + label) so a value reads identically and colour-blind
// -safe on every surface. Replaces the old forked emerald/amber/red helpers.
export const decisionTone: Record<KomiteVoteValue, StatusTone> = {
  approve: 'success',
  conditional: 'warning',
  reject: 'danger',
}

// Indonesian short date for a meeting's ISO `date` (e.g. "26 Mei 2026").
export function formatMeetingDate(date: string): string {
  return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Short, consistent venue text. Modality is implicit from the fields: a physical
// room → tatap muka; a link only → "Rapat daring"; both → "{room} · Daring" (hybrid).
export function meetingVenueLabel(m: Pick<KomiteMeeting, 'room' | 'meetingUrl'>): string {
  if (m.room) return m.meetingUrl ? `${m.room} · Daring` : m.room
  return 'Rapat daring'
}

// Eligible committee roster — all users holding the CM role. A meeting's
// attendees and chair are picked from this pool per session.
export function committeeRoster(): User[] {
  return USERS.filter((u) => u.role === 'CM')
}

// The meeting whose agenda includes this application, if any. An app must sit
// on a meeting agenda for its voting composition to be defined. Meetings are
// passed in (loaded from the repo) — this stays a pure resolver.
export function meetingForApp(meetings: KomiteMeeting[], appId: string): KomiteMeeting | undefined {
  return meetings.find((m) => m.agendaAppIds.includes(appId))
}

export interface Committee {
  attendees: User[]
  chair: User
}

// Resolves a meeting's composition (attendees + chair). Chair
// and attendees are per-meeting. Returns undefined when the meeting references
// users that can't be resolved, or the chair is not among the attendees.
export function committeeOf(meeting: KomiteMeeting): Committee | undefined {
  const roster = committeeRoster()
  const attendees = meeting.attendeeUserIds
    .map((id) => roster.find((u) => u.id === id))
    .filter((u): u is User => Boolean(u))
  const chair = roster.find((u) => u.id === meeting.chairUserId)
  if (!chair || attendees.length === 0 || !attendees.some((a) => a.id === chair.id)) return undefined
  return { attendees, chair }
}

// ── Rapat Komite: signed-MoM-as-decision (ADR-0005) ──────────────────────────────
// The committee no longer votes in-app. The decision applies when every attending Komite member
// has QR-signed the per-app MoM. Required signers = the meeting's attendees who hold the Komite
// role (added non-Komite participants attest but do NOT gate). A meeting must be quorate
// (≥ MIN_KOMITE_QUORUM Komite attending) before its MoM can finalise. Pure — tested in komite.test.ts.

export const MIN_KOMITE_QUORUM = 2 // config default; W1 ratifies Hijra's real Komite quorum.

/** The userIds that MUST sign an app's MoM = the meeting's attending Komite members. */
export function momRequiredSignerIds(meeting: Pick<KomiteMeeting, 'attendeeUserIds'>): string[] {
  const komite = new Set(committeeRoster().map((u) => u.id))
  return meeting.attendeeUserIds.filter((id) => komite.has(id))
}

/** Pure validation for an attendee-list edit (Batch 8 / gap #19 — RM corrects real attendance so a
 *  no-show Komite member can't deadlock the MoM). Returns an error message, or null if the edit is
 *  allowed. Lifecycle mirrors the reschedule freeze: only while proposed/upcoming; FROZEN once any
 *  agenda MoM carries a signature; the chair must remain an attendee; the list can't be emptied.
 *  Quorum is NOT checked here — it is enforced at finalisation (momComplete needs ≥ MIN_KOMITE_QUORUM). */
export function attendeeUpdateError(
  meeting: { status: MeetingStatus; chairUserId: string },
  hasMomSignatures: boolean,
  nextAttendeeUserIds: readonly string[],
): string | null {
  if (meeting.status !== 'proposed' && meeting.status !== 'upcoming') {
    return 'Peserta hanya dapat diubah selagi rapat masih usulan atau akan datang.'
  }
  if (hasMomSignatures) return 'Daftar peserta terkunci — MoM sudah mulai ditandatangani.'
  if (nextAttendeeUserIds.length === 0) return 'Peserta tidak boleh kosong.'
  if (!nextAttendeeUserIds.includes(meeting.chairUserId)) return 'Ketua sidang harus tetap menjadi peserta.'
  return null
}

/** True once every required Komite signer has signed AND the meeting is quorate. The set-membership
 *  completion rule (unordered) — contrast the ordered MUAP/RSK ladder (isChainComplete). */
export function momComplete(signedUserIds: readonly string[], requiredUserIds: readonly string[]): boolean {
  if (requiredUserIds.length < MIN_KOMITE_QUORUM) return false
  const signed = new Set(signedUserIds)
  return requiredUserIds.every((id) => signed.has(id))
}

/** A meeting is "ongoing" once its scheduled start has passed but it isn't completed/cancelled — a
 *  DERIVED state (#13), no stored flag, so a postponed-but-unedited meeting can still be rescheduled.
 *  Approximate (server-local parse) — fine for a status badge. */
export function isOngoing(meeting: Pick<KomiteMeeting, 'date' | 'time' | 'status'>, now: Date = new Date()): boolean {
  if (meeting.status !== 'upcoming') return false
  return now >= new Date(`${meeting.date}T${meeting.time}:00`)
}

// ── Minutes-of-Meeting (MOM) SLA ──────────────────────────────────────────────
// Hijra SOP: a completed committee session's minutes (notulen) are due ≤ H+1 business day.
// Business-day aware (Asia/Jakarta) so a Friday meeting isn't "overdue" by Monday. Returns null
// for meetings that don't (yet) require a MOM. The per-app DecisionCheckpoint is the immutable
// frozen record; the MOM is the session-level log this SLA chases.

export interface MomSlaResult {
  status: SLAStatus // 'done' | 'normal' | 'at_risk' | 'overdue'
  label: string
}

/** True once minutes are recorded for the meeting. */
export function momRecorded(meeting: Pick<KomiteMeeting, 'minutes' | 'minutesRecordedAt'>): boolean {
  return !!meeting.minutes?.trim() && !!meeting.minutesRecordedAt
}

/**
 * MOM SLA state for a meeting. Only completed meetings carry a MOM duty → others return null.
 * Due ≤ H+1 business day: H+0 (meeting day) = normal, H+1 (next business day) = at_risk (last day),
 * beyond H+1 = overdue. `done` once minutes are recorded. Clock starts at the meeting's Jakarta
 * date/time (Jakarta is fixed UTC+7, no DST, so the offset literal is exact).
 */
export function meetingMomSlaState(meeting: KomiteMeeting, now: Date = new Date(), holidays?: HolidayCalendar): MomSlaResult | null {
  if (meeting.status !== 'completed') return null
  if (momRecorded(meeting)) return { status: 'done', label: 'Notulen tercatat' }
  const start = new Date(`${meeting.date}T${meeting.time || '00:00'}:00+07:00`)
  const elapsed = businessDaysElapsed(start, now, holidays)
  if (elapsed > 1) return { status: 'overdue', label: `Notulen terlambat ${elapsed - 1} HK` }
  if (elapsed === 1) return { status: 'at_risk', label: 'Notulen jatuh tempo (H+1)' }
  return { status: 'normal', label: 'Notulen belum dibuat' }
}
