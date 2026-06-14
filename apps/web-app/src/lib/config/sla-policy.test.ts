import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSlaTargets, parseDeskSlaTargets } from './sla-policy'

test('parseSlaTargets — accepts a complete valid map (string or number keys)', () => {
  assert.deepEqual(parseSlaTargets({ 1: 3, 2: 5, 3: 5, 4: 5, 5: 3, 6: 5 }), { 1: 3, 2: 5, 3: 5, 4: 5, 5: 3, 6: 5 })
  assert.deepEqual(parseSlaTargets({ '1': 2, '2': 2, '3': 2, '4': 2, '5': 2, '6': 2 }), { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 })
})

test('parseSlaTargets — rejects missing / non-integer / out-of-bounds stages', () => {
  assert.throws(() => parseSlaTargets({ 1: 3, 2: 5, 3: 5, 4: 5, 5: 3 }), /tahap 6/) // missing stage 6
  assert.throws(() => parseSlaTargets({ 1: 0, 2: 5, 3: 5, 4: 5, 5: 3, 6: 5 }), /tahap 1/) // 0 < min
  assert.throws(() => parseSlaTargets({ 1: 3, 2: 5, 3: 5, 4: 5, 5: 3, 6: 999 }), /tahap 6/) // > max
  assert.throws(() => parseSlaTargets({ 1: 2.5, 2: 5, 3: 5, 4: 5, 5: 3, 6: 5 }), /tahap 1/) // non-integer
  assert.throws(() => parseSlaTargets({ 1: 'x', 2: 5, 3: 5, 4: 5, 5: 3, 6: 5 }), /tahap 1/) // NaN
})

test('parseDeskSlaTargets — accepts a partial map of known desks (HK); empty stays empty', () => {
  assert.deepEqual(parseDeskSlaTargets({}), {})
  assert.deepEqual(parseDeskSlaTargets({ 'legal': 2, 'rsk-author': 3 }), { 'legal': 2, 'rsk-author': 3 })
})

test('parseDeskSlaTargets — rejects unknown desk ids and out-of-range HK', () => {
  assert.throws(() => parseDeskSlaTargets({ 'S9-NOPE': 2 }), /tidak dikenal/)
  assert.throws(() => parseDeskSlaTargets({ 'legal': 0 }), /legal/) // < min
  assert.throws(() => parseDeskSlaTargets({ 'legal': 400 }), /legal/) // > max
  assert.throws(() => parseDeskSlaTargets({ 'legal': 1.5 }), /legal/) // non-integer
})
