import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRiskPolicy } from './risk-policy-input'

test('parseRiskPolicy — accepts valid thresholds', () => {
  assert.deepEqual(parseRiskPolicy({ dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 1 }), { dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 1 })
  assert.deepEqual(parseRiskPolicy({ dsrMaxPct: 35, ltvMaxPct: 65, kolMax: 2 }), { dsrMaxPct: 35, ltvMaxPct: 65, kolMax: 2 })
})

test('parseRiskPolicy — rejects out-of-range / non-integer', () => {
  assert.throws(() => parseRiskPolicy({ dsrMaxPct: 0, ltvMaxPct: 70, kolMax: 1 }), /DSR/)
  assert.throws(() => parseRiskPolicy({ dsrMaxPct: 101, ltvMaxPct: 70, kolMax: 1 }), /DSR/)
  assert.throws(() => parseRiskPolicy({ dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 6 }), /Kolektibilitas/) // kol max 5
  assert.throws(() => parseRiskPolicy({ dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 0 }), /Kolektibilitas/)
  assert.throws(() => parseRiskPolicy({ dsrMaxPct: 40.5, ltvMaxPct: 70, kolMax: 1 }), /DSR/)
  assert.throws(() => parseRiskPolicy({ dsrMaxPct: 'x', ltvMaxPct: 70, kolMax: 1 }), /DSR/)
})
