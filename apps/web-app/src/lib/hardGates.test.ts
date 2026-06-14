import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeViolations, DEFAULT_RISK_POLICY } from './hardGates'
import type { HardGates } from './types'

// Compliance-core OJK hard gates: DSR > 40%, LTV > 70%, Kol > 1 each FAIL.
// The boundary (==) must PASS — a stricter-than-spec off-by-one would wrongly reject.

const gates = (dsr: number, ltv: number, kol: number): HardGates => ({ dsr, ltv, kol })

test('computeViolations — none at or below the thresholds', () => {
  assert.deepEqual(computeViolations(gates(40, 70, 1)), [])
  assert.deepEqual(computeViolations(gates(0, 0, 1)), [])
})

test('computeViolations — each gate trips just past its threshold', () => {
  assert.deepEqual(computeViolations(gates(41, 70, 1)), ['dsr'])
  assert.deepEqual(computeViolations(gates(40, 71, 1)), ['ltv'])
  assert.deepEqual(computeViolations(gates(40, 70, 2)), ['kol'])
})

test('computeViolations — multiple gates fail together, in dsr/ltv/kol order', () => {
  assert.deepEqual(computeViolations(gates(50, 80, 3)), ['dsr', 'ltv', 'kol'])
})

test('computeViolations — default policy equals the OJK thresholds 40/70/1', () => {
  assert.deepEqual(DEFAULT_RISK_POLICY, { dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 1 })
})

test('computeViolations — honors a custom (configured) policy over the default', () => {
  // A stricter policy fails values that pass under the default…
  const strict = { dsrMaxPct: 30, ltvMaxPct: 60, kolMax: 1 }
  assert.deepEqual(computeViolations(gates(35, 65, 1), strict), ['dsr', 'ltv'])
  // …and a looser policy passes values that fail under the default.
  const loose = { dsrMaxPct: 60, ltvMaxPct: 90, kolMax: 2 }
  assert.deepEqual(computeViolations(gates(50, 80, 2), loose), [])
  // Boundary stays inclusive-pass under any policy.
  assert.deepEqual(computeViolations(gates(30, 60, 1), strict), [])
})
