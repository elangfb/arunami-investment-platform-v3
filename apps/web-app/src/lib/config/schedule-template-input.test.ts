import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseScheduleTemplate, parseScheduleTemplates } from './schedule-template-input'

const valid = {
  scheduleKey: 'tue-1600-roomA',
  dayOfWeek: 2,
  time: '16:00',
  room: 'Ruang A',
  meetingUrl: null,
  attendeeUserIds: ['u-cm-1', 'u-cm-2', 'u-cm-3'],
  chairUserId: 'u-cm-1',
  capacity: 2,
  routingFilter: { minPlafond: 1_000_000_000, akadTypes: ['Musyarakah'] },
}

test('parseScheduleTemplate — accepts a well-formed template', () => {
  const t = parseScheduleTemplate(valid)
  assert.equal(t.scheduleKey, 'tue-1600-roomA')
  assert.equal(t.dayOfWeek, 2)
  assert.equal(t.time, '16:00')
  assert.equal(t.chairUserId, 'u-cm-1')
  assert.deepEqual(t.routingFilter, { minPlafond: 1_000_000_000, akadTypes: ['Musyarakah'] })
})

test('parseScheduleTemplate — rejects bad scheduleKey', () => {
  assert.throws(() => parseScheduleTemplate({ ...valid, scheduleKey: 'x' }), /scheduleKey/)
  assert.throws(() => parseScheduleTemplate({ ...valid, scheduleKey: 'has space' }), /scheduleKey/)
})

test('parseScheduleTemplate — rejects bad dayOfWeek / time', () => {
  assert.throws(() => parseScheduleTemplate({ ...valid, dayOfWeek: 7 }), /dayOfWeek/)
  assert.throws(() => parseScheduleTemplate({ ...valid, time: '25:00' }), /time/)
  assert.throws(() => parseScheduleTemplate({ ...valid, time: '16:7' }), /time/)
})

test('parseScheduleTemplate — chair must be in attendees', () => {
  assert.throws(
    () => parseScheduleTemplate({ ...valid, chairUserId: 'u-other' }),
    /chairUserId harus menjadi salah satu attendee/,
  )
})

test('parseScheduleTemplate — capacity ≥ 1; empty attendees rejected', () => {
  assert.throws(() => parseScheduleTemplate({ ...valid, capacity: 0 }), /capacity/)
  assert.throws(() => parseScheduleTemplate({ ...valid, attendeeUserIds: [] }), /attendeeUserIds/)
})

test('parseScheduleTemplate — routingFilter bounds validated', () => {
  assert.throws(() => parseScheduleTemplate({ ...valid, routingFilter: { minPlafond: -1 } }), /minPlafond/)
  assert.throws(
    () => parseScheduleTemplate({ ...valid, routingFilter: { minPlafond: 100, maxPlafond: 10 } }),
    /min.*max/,
  )
})

test('parseScheduleTemplates — empty array OK; duplicate scheduleKey rejected', () => {
  assert.deepEqual(parseScheduleTemplates([]), [])
  assert.throws(
    () => parseScheduleTemplates([valid, { ...valid, time: '17:00' }]),
    /Duplikat scheduleKey/,
  )
})
