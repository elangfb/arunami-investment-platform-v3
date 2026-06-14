import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { materializeMeetingsFor } from './materialize'
import { parseScheduleTemplate, type MeetingScheduleTemplate } from '@/lib/config/schedule-template-input'
import { createApplication } from '@/server/repo/write'
import { listMeetings } from '@/server/repo/meetings'
import { clearFirestore, makeApp } from '@/server/repo/fs-test-helpers'

// Firestore-emulator itest for the daily meeting materializer under DATA_BACKEND=firestore. Verifies
// the backend-aware candidate query (applications.firestore.listUnscheduledCommitteeCandidates) + the
// slot-idempotency anchor wired into meetings.firestore.createMeeting (index_meetingTemplateSlot ⇒
// DuplicateMeetingSlotError). Parity target: scheduling/materialize.ts against Postgres.

// A Tuesday in Asia/Jakarta (2026-06-16T04:00Z = 11:00 WIB, Tue). dayOfWeekJakarta → 2.
const TUE = new Date('2026-06-16T04:00:00Z')

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

function tmpl(overrides: Partial<MeetingScheduleTemplate> = {}): MeetingScheduleTemplate {
  return parseScheduleTemplate({
    scheduleKey: 'tue-1600',
    dayOfWeek: 2,
    time: '16:00',
    room: 'Ruang A',
    attendeeUserIds: ['u1', 'u2'],
    chairUserId: 'u1',
    capacity: 2,
    ...overrides,
  })
}

/** Seed a committee-eligible stage-5 app (riskRecommendation set, undecided). */
async function seedEligible(id: string, opts: { enteredAt: Date; plafond?: number }) {
  await createApplication(
    makeApp(id, {
      stage: 5,
      riskRecommendation: 'approve',
      enteredStageAt: opts.enteredAt,
      requestedPlafond: opts.plafond ?? 100_000_000,
    }),
  )
}

test('materializes a proposed meeting; agenda = eligible apps ordered by enteredStageAt, capped at capacity', async () => {
  await seedEligible('APP-C', { enteredAt: new Date('2026-06-03T00:00:00Z') })
  await seedEligible('APP-A', { enteredAt: new Date('2026-06-01T00:00:00Z') })
  await seedEligible('APP-B', { enteredAt: new Date('2026-06-02T00:00:00Z') })

  const r = await materializeMeetingsFor(TUE, [tmpl({ capacity: 2 })], { createdBy: 'admin' })
  assert.equal(r.created.length, 1)
  assert.equal(r.skipped.length, 0)
  assert.equal(r.created[0].agendaCount, 2)

  const meetings = await listMeetings()
  assert.equal(meetings.length, 1)
  const m = meetings[0]
  assert.equal(m.status, 'proposed')
  assert.deepEqual(m.agendaAppIds, ['APP-A', 'APP-B']) // enteredStageAt asc; C overflows capacity
  assert.deepEqual(m.attendeeUserIds, ['u1', 'u2'])
  assert.equal(m.chairUserId, 'u1')
  assert.equal(m.sourceTemplateId, 'tue-1600')
  assert.ok(m.agendaReasons?.['APP-A'])
})

test('idempotent: re-running the same (template, date) slot is skipped (duplicate), no second meeting', async () => {
  await seedEligible('APP-A', { enteredAt: new Date('2026-06-01T00:00:00Z') })
  const first = await materializeMeetingsFor(TUE, [tmpl()], { createdBy: 'admin' })
  assert.equal(first.created.length, 1)

  const second = await materializeMeetingsFor(TUE, [tmpl()], { createdBy: 'admin' })
  assert.equal(second.created.length, 0)
  assert.deepEqual(second.skipped, [{ scheduleKey: 'tue-1600', reason: 'duplicate' }])
  assert.equal((await listMeetings()).length, 1) // still exactly one
})

test('wrong-day template is skipped (no meeting created)', async () => {
  await seedEligible('APP-A', { enteredAt: new Date('2026-06-01T00:00:00Z') })
  const r = await materializeMeetingsFor(TUE, [tmpl({ scheduleKey: 'wed-1600', dayOfWeek: 3 })], { createdBy: 'admin' })
  assert.equal(r.created.length, 0)
  assert.deepEqual(r.skipped, [{ scheduleKey: 'wed-1600', reason: 'wrong-day' }])
  assert.equal((await listMeetings()).length, 0)
})

test('routingFilter excludes apps below minPlafond', async () => {
  await seedEligible('APP-SMALL', { enteredAt: new Date('2026-06-01T00:00:00Z'), plafond: 100_000_000 })
  await seedEligible('APP-BIG', { enteredAt: new Date('2026-06-02T00:00:00Z'), plafond: 900_000_000 })

  await materializeMeetingsFor(TUE, [tmpl({ routingFilter: { minPlafond: 500_000_000 } })], { createdBy: 'admin' })
  const m = (await listMeetings())[0]
  assert.deepEqual(m.agendaAppIds, ['APP-BIG'])
})

test('anti-join: apps already on a proposed meeting are not re-selected by a later template in the run', async () => {
  await seedEligible('APP-A', { enteredAt: new Date('2026-06-01T00:00:00Z') })
  await seedEligible('APP-B', { enteredAt: new Date('2026-06-02T00:00:00Z') })
  await seedEligible('APP-C', { enteredAt: new Date('2026-06-03T00:00:00Z') })

  const r = await materializeMeetingsFor(
    TUE,
    [tmpl({ scheduleKey: 'tue-am', capacity: 2 }), tmpl({ scheduleKey: 'tue-pm', time: '13:00', capacity: 2 })],
    { createdBy: 'admin' },
  )
  assert.equal(r.created.length, 2)
  const byKey = new Map((await listMeetings()).map((m) => [m.sourceTemplateId, m.agendaAppIds]))
  assert.deepEqual(byKey.get('tue-am'), ['APP-A', 'APP-B'])
  assert.deepEqual(byKey.get('tue-pm'), ['APP-C']) // A & B already booked
})

test('non-candidates (wrong stage / rejected / already decided) are not scheduled', async () => {
  await createApplication(makeApp('S4', { stage: 4, riskRecommendation: 'approve', enteredStageAt: new Date('2026-06-01T00:00:00Z') }))
  await createApplication(makeApp('REJ', { stage: 5, riskRecommendation: 'reject', enteredStageAt: new Date('2026-06-01T00:00:00Z') }))
  await createApplication(makeApp('DECIDED', { stage: 5, riskRecommendation: 'approve', komiteDecision: 'approve', enteredStageAt: new Date('2026-06-01T00:00:00Z') }))
  await seedEligible('OK', { enteredAt: new Date('2026-06-02T00:00:00Z') })

  await materializeMeetingsFor(TUE, [tmpl()], { createdBy: 'admin' })
  const m = (await listMeetings())[0]
  assert.deepEqual(m.agendaAppIds, ['OK'])
})
