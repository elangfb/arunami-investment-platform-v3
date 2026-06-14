import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attendeeUpdateError, momComplete, momRequiredSignerIds, MIN_KOMITE_QUORUM, isOngoing } from './komite'

// Rapat Komite signed-MoM rules (ADR-0005). Pure functions.

// ── Rapat Komite signed-MoM (ADR-0005) ───────────────────────────────────────
// committeeRoster = seeded CM users u-004 / u-007 / u-008.
test('momRequiredSignerIds — only the attending KOMITE members (added non-Komite ignored)', () => {
  // u-002 is RM (an added participant), not a required signer.
  assert.deepEqual(momRequiredSignerIds({ attendeeUserIds: ['u-004', 'u-007', 'u-002'] }), ['u-004', 'u-007'])
  assert.deepEqual(momRequiredSignerIds({ attendeeUserIds: ['u-002'] }), [])
})

test('momComplete — every required Komite signed AND quorate', () => {
  assert.equal(MIN_KOMITE_QUORUM, 2)
  // all required signed, quorate → complete
  assert.equal(momComplete(['u-004', 'u-007'], ['u-004', 'u-007']), true)
  assert.equal(momComplete(['u-004', 'u-007', 'u-008'], ['u-004', 'u-007', 'u-008']), true)
  // missing a signer → not complete
  assert.equal(momComplete(['u-004'], ['u-004', 'u-007']), false)
  // sub-quorum (< 2 required) never completes — forces re-convene
  assert.equal(momComplete(['u-004'], ['u-004']), false)
  // extra signatures beyond required don't break it
  assert.equal(momComplete(['u-004', 'u-007', 'u-999'], ['u-004', 'u-007']), true)
})

// ── Batch 8 / gap #19: no-show attendee correction (RM-as-sekretariat) ─────────
test('attendeeUpdateError — no-show recovery: shrinking the attendee set lets a deadlocked MoM finalise', () => {
  // 3 Komite scheduled; u-008 no-shows. While u-008 is still listed, the MoM can never complete.
  const required0 = momRequiredSignerIds({ attendeeUserIds: ['u-004', 'u-007', 'u-008'] })
  assert.deepEqual(required0, ['u-004', 'u-007', 'u-008'])
  assert.equal(momComplete(['u-004', 'u-007'], required0), false, 'deadlock: u-008 absent but still required')

  // RM corrects real attendance (drops the no-show); chair u-004 stays. Edit is allowed pre-signature…
  const next = ['u-004', 'u-007']
  assert.equal(attendeeUpdateError({ status: 'upcoming', chairUserId: 'u-004' }, false, next), null)
  // …and now the two present Komite can finalise (still quorate ≥2).
  const required1 = momRequiredSignerIds({ attendeeUserIds: next })
  assert.deepEqual(required1, ['u-004', 'u-007'])
  assert.equal(momComplete(['u-004', 'u-007'], required1), true, 'recovered: MoM completes with the present Komite')
})

test('attendeeUpdateError — lifecycle + integrity guards', () => {
  const upcoming = { status: 'upcoming' as const, chairUserId: 'u-004' }
  // frozen once the MoM is being signed (signature fixes who was present)
  assert.match(attendeeUpdateError(upcoming, true, ['u-004', 'u-007']) ?? '', /terkunci/)
  // only while proposed/upcoming
  assert.match(attendeeUpdateError({ status: 'completed', chairUserId: 'u-004' }, false, ['u-004', 'u-007']) ?? '', /usulan atau akan datang/)
  // the chair must remain an attendee
  assert.match(attendeeUpdateError(upcoming, false, ['u-007', 'u-008']) ?? '', /Ketua/)
  // can't empty the list
  assert.match(attendeeUpdateError(upcoming, false, []) ?? '', /tidak boleh kosong/)
  // a valid edit returns null
  assert.equal(attendeeUpdateError(upcoming, false, ['u-004', 'u-007']), null)
})

test('isOngoing — past scheduled start while upcoming; not for proposed/completed/cancelled', () => {
  const base = { date: '2026-06-01', time: '10:00', status: 'upcoming' as const }
  assert.equal(isOngoing(base, new Date('2026-06-01T11:00:00')), true) // start passed
  assert.equal(isOngoing(base, new Date('2026-06-01T09:00:00')), false) // before start
  assert.equal(isOngoing({ ...base, status: 'proposed' }, new Date('2026-06-01T11:00:00')), false)
  assert.equal(isOngoing({ ...base, status: 'completed' }, new Date('2026-06-01T11:00:00')), false)
})
