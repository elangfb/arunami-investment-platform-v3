import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRooms } from './rooms-policy'

test('parseRooms — accepts valid room lists', () => {
  assert.deepEqual(parseRooms(['Ruang Komite Lt.5', ' Ruang Meeting A ']), ['Ruang Komite Lt.5', 'Ruang Meeting A'])
})

test('parseRooms — dedupes case-insensitively', () => {
  assert.deepEqual(parseRooms(['Ruang Komite Lt.5', 'ruang komite lt.5', 'RUANG MEETING A']), ['Ruang Komite Lt.5', 'RUANG MEETING A'])
})

test('parseRooms — rejects empty array / empty-or-nonstring entry / more than 20 rooms', () => {
  assert.throws(() => parseRooms([]), /minimal 1 ruang/)
  assert.throws(() => parseRooms(['Ruang Komite Lt.5', '   ']), /tidak boleh kosong/)
  assert.throws(() => parseRooms(['Ruang Komite Lt.5', 5]), /berupa teks/)
  assert.throws(() => parseRooms(['x'.repeat(81)]), /maksimal 80 karakter/)
  assert.throws(() => parseRooms(Array.from({ length: 21 }, (_, i) => `Ruang ${i + 1}`)), /maksimal 20 ruang/)
})
