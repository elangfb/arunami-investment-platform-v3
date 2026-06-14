import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMeeting, listMeetings, getMeeting, setMeetingStatus, setMeetingAttendees, meetingHasMomSignatures, completeMeetingIfAllDecided } from './meetings'
import { appendMomSignature } from './approval'
import { createApplication } from './write'
import { clearFirestore, makeApp } from './fs-test-helpers'
import type { KomiteMeeting } from '@/lib/types'

// Firestore-emulator itest for the committee-meeting repo (scripts/test-integration-firestore.sh).

const YEAR = new Date().getFullYear()
function makeMeeting(over: Partial<Omit<KomiteMeeting, 'id'>> = {}): Omit<KomiteMeeting, 'id'> {
  return {
    date: '2026-06-20', time: '10:00', agendaAppIds: [], agendaReasons: {}, attendeeUserIds: ['k1', 'k2'],
    chairUserId: 'k1', status: 'upcoming', createdBy: 'admin', createdAt: new Date(), ...over,
  }
}

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('createMeeting — counter-allocated MTG-YYYY-NNN ids', async () => {
  const m1 = await createMeeting(makeMeeting())
  const m2 = await createMeeting(makeMeeting())
  assert.equal(m1.id, `MTG-${YEAR}-001`)
  assert.equal(m2.id, `MTG-${YEAR}-002`)
})

test('getMeeting/listMeetings round-trip; optional fields undefined (not null)', async () => {
  const m = await createMeeting(makeMeeting({ agendaAppIds: ['A1'], agendaReasons: { A1: 'plafond besar' } }))
  const got = await getMeeting(m.id)
  assert.equal(got?.room, undefined) // absent optional → undefined (critique #22)
  assert.deepEqual(got?.agendaAppIds, ['A1'])
  assert.equal(got?.agendaReasons?.A1, 'plafond besar')
  assert.equal((await listMeetings()).length, 1)
})

test('setMeetingAttendees / setMeetingStatus — partial update preserves agenda (critique #15)', async () => {
  const m = await createMeeting(makeMeeting({ agendaAppIds: ['A1', 'A2'] }))
  const upd = await setMeetingAttendees(m.id, ['k9'])
  assert.deepEqual(upd.attendeeUserIds, ['k9'])
  assert.deepEqual(upd.agendaAppIds, ['A1', 'A2'], 'agenda survives an attendees update')
  const done = await setMeetingStatus(m.id, 'completed')
  assert.equal(done.status, 'completed')
  assert.deepEqual(done.agendaAppIds, ['A1', 'A2'])
})

test('meetingHasMomSignatures — true once an agenda app has a MoM signature', async () => {
  await createApplication(makeApp('FS-MTG-MOM', { stage: 5 }))
  const m = await createMeeting(makeMeeting({ agendaAppIds: ['FS-MTG-MOM'] }))
  assert.equal(await meetingHasMomSignatures(m.id), false)
  await appendMomSignature({ appId: 'FS-MTG-MOM', expectedVersion: 0, userId: 'k1', userName: 'Komite A', audit: { action: 'TTD MoM', stage: 5 } })
  assert.equal(await meetingHasMomSignatures(m.id), true)
})

test('completeMeetingIfAllDecided — completes once every agenda app has left stage 5', async () => {
  await createApplication(makeApp('FS-MTG-DEC', { stage: 6 })) // already routed off stage 5
  const m = await createMeeting(makeMeeting({ agendaAppIds: ['FS-MTG-DEC'] }))
  await completeMeetingIfAllDecided('FS-MTG-DEC')
  assert.equal((await getMeeting(m.id))?.status, 'completed')
})
