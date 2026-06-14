import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDisbursementConditions } from './disbursement-conditions'
import { disbursementConditionsComplete } from '../disbursement'

test('parseDisbursementConditions — accepts valid condition lists', () => {
  assert.deepEqual(parseDisbursementConditions(['Syarat A', ' Syarat B ']), ['Syarat A', 'Syarat B'])
})

test('parseDisbursementConditions — dedupes case-insensitively', () => {
  assert.deepEqual(parseDisbursementConditions(['Syarat A', 'syarat a', 'SYARAT B']), ['Syarat A', 'SYARAT B'])
})

test('parseDisbursementConditions — rejects empty array / empty-or-nonstring entry / more than 15 conditions', () => {
  assert.throws(() => parseDisbursementConditions([]), /minimal 1 syarat/)
  assert.throws(() => parseDisbursementConditions(['Syarat A', '   ']), /tidak boleh kosong/)
  assert.throws(() => parseDisbursementConditions(['Syarat A', 5]), /berupa teks/)
  assert.throws(() => parseDisbursementConditions(['x'.repeat(121)]), /maksimal 120 karakter/)
  assert.throws(() => parseDisbursementConditions(Array.from({ length: 16 }, (_, i) => `Syarat ${i + 1}`)), /maksimal 15 syarat/)
})

test('disbursementConditionsComplete — respects a custom live condition list', () => {
  const done = {
    'Syarat lama': true,
    'Syarat aktif A': true,
    'Syarat aktif B': false,
  }

  assert.equal(disbursementConditionsComplete(done, ['Syarat aktif A', 'Syarat aktif B']), false)
  assert.equal(disbursementConditionsComplete({ ...done, 'Syarat aktif B': true }, ['Syarat aktif A', 'Syarat aktif B']), true)
})
