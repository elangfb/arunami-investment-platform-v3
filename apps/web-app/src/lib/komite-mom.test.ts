import { test } from 'node:test'
import assert from 'node:assert/strict'
import { meetingMomSlaState, momRecorded } from './komite'
import { buildMeetingNotifications } from './notifications'
import { parseScheduleTemplates } from './config/schedule-template-input'
import { dayOfWeekJakarta } from './scheduling/jakarta-clock'
import type { KomiteMeeting } from './types'

const meeting = (over: Partial<KomiteMeeting>): KomiteMeeting => ({
  id: 'MTG-2026-001',
  date: '2026-05-25', // Monday
  time: '14:00',
  agendaAppIds: [],
  attendeeUserIds: ['u1'],
  chairUserId: 'u1',
  status: 'completed',
  createdBy: 'u1',
  createdAt: new Date('2026-05-25T07:00:00Z'),
  ...over,
})

// ── MOM SLA (≤ H+1 business day) ──────────────────────────────────────────────

test('meetingMomSlaState — only completed meetings carry a MOM duty', () => {
  assert.equal(meetingMomSlaState(meeting({ status: 'upcoming' }), new Date('2026-05-28T02:00:00Z')), null)
  assert.equal(meetingMomSlaState(meeting({ status: 'proposed' }), new Date('2026-05-28T02:00:00Z')), null)
})

test('meetingMomSlaState — done once minutes are recorded', () => {
  const m = meeting({ minutes: 'Notulen lengkap.', minutesRecordedAt: new Date('2026-05-26T03:00:00Z') })
  assert.equal(meetingMomSlaState(m, new Date('2026-06-10T02:00:00Z'))?.status, 'done')
  assert.equal(momRecorded(m), true)
})

test('meetingMomSlaState — H+0 normal, H+1 at_risk, beyond overdue (business-day aware)', () => {
  const m = meeting({ date: '2026-06-08', time: '14:00' }) // Mon (holiday-free June week), no minutes
  assert.equal(meetingMomSlaState(m, new Date('2026-06-08T10:00:00Z'))?.status, 'normal') // same day (Mon 17:00)
  assert.equal(meetingMomSlaState(m, new Date('2026-06-09T02:00:00Z'))?.status, 'at_risk') // Tue (H+1)
  const od = meetingMomSlaState(m, new Date('2026-06-10T02:00:00Z')) // Wed (H+2 business)
  assert.equal(od?.status, 'overdue')
  assert.match(od!.label, /terlambat 1 HK/i)
})

test('meetingMomSlaState — weekend does not make a Friday meeting overdue by Monday', () => {
  const fri = meeting({ id: 'MTG-2026-009', date: '2026-06-12', time: '14:00' }) // Friday (holiday-free)
  // Next Monday is only H+1 business day → still at_risk, NOT overdue.
  assert.equal(meetingMomSlaState(fri, new Date('2026-06-15T02:00:00Z'))?.status, 'at_risk')
})

// ── MOM notifications ─────────────────────────────────────────────────────────

test('buildMeetingNotifications — a long-overdue completed MOM raises a danger signal', () => {
  // Far-past completed meeting with no minutes → always overdue under the real clock.
  const items = buildMeetingNotifications([meeting({ date: '2020-01-06', time: '14:00' })]) // Mon 2020
  assert.equal(items.length, 1)
  assert.equal(items[0].severity, 'danger')
  assert.equal(items[0].category, 'mom')
  assert.equal(items[0].href, '/komite')
})

test('buildMeetingNotifications — recorded MOM and non-completed meetings raise nothing', () => {
  const recorded = meeting({ date: '2020-01-06', minutes: 'ok', minutesRecordedAt: new Date('2020-01-07T03:00:00Z') })
  const upcoming = meeting({ id: 'MTG-X', status: 'upcoming', date: '2020-01-06' })
  assert.deepEqual(buildMeetingNotifications([recorded, upcoming]), [])
})

// ── Mon/Wed/Fri cadence is pure config ────────────────────────────────────────

test('cadence — a 3-template Mon/Wed/Fri schedule validates (distinct scheduleKeys)', () => {
  const raw = [1, 3, 5].map((dow, i) => ({
    scheduleKey: `komite-${['mon', 'wed', 'fri'][i]}`,
    dayOfWeek: dow,
    time: '14:00',
    attendeeUserIds: ['u1', 'u2'],
    chairUserId: 'u1',
    capacity: 5,
  }))
  const parsed = parseScheduleTemplates(raw)
  assert.deepEqual(parsed.map((t) => t.dayOfWeek), [1, 3, 5])
})

test('cadence — over one week, Mon/Wed/Fri templates fire on exactly their days', () => {
  const cadence = [1, 3, 5] // the materializer fires template t on a date D iff t.dayOfWeek === dayOfWeekJakarta(D)
  const from = new Date('2026-05-25T01:00:00Z') // Mon 08:00 Jakarta
  const fired: number[] = []
  for (let i = 0; i < 7; i++) {
    const dow = dayOfWeekJakarta(new Date(from.getTime() + i * 86_400_000))
    if (cadence.includes(dow)) fired.push(dow)
  }
  assert.deepEqual(fired, [1, 3, 5]) // exactly Mon, Wed, Fri — weekends + Tue/Thu skipped
})
