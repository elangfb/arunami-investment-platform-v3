import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateApprovedTerms, validateDecisionNote } from './komite-terms'
import type { LoanApplication } from './types'

const app = { requestedPlafond: 100_000_000, requestedTenorMonths: 24 } as Pick<
  LoanApplication,
  'requestedPlafond' | 'requestedTenorMonths'
>

test('valid flat-akad terms (plafond ≤ requested) pass', () => {
  assert.equal(
    validateApprovedTerms(app, { approvedPlafond: 100_000_000, approvedTenorMonths: 24, approvedMarginRate: 12 }, true),
    null,
  )
  assert.equal(
    validateApprovedTerms(app, { approvedPlafond: 80_000_000, approvedTenorMonths: 12, approvedMarginRate: 0 }, true),
    null,
  )
})

test('approvedPlafond must not exceed requestedPlafond', () => {
  const err = validateApprovedTerms(app, { approvedPlafond: 100_000_001, approvedTenorMonths: 24, approvedMarginRate: 12 }, true)
  assert.ok(err && err.includes('tidak boleh melebihi'))
})

test('approvedPlafond must be a positive number', () => {
  for (const bad of [0, -1, Number.NaN, undefined]) {
    assert.ok(validateApprovedTerms(app, { approvedPlafond: bad as number, approvedTenorMonths: 24, approvedMarginRate: 12 }, true))
  }
})

test('approvedTenorMonths must be a positive integer', () => {
  for (const bad of [0, -3, 12.5, undefined]) {
    assert.ok(validateApprovedTerms(app, { approvedPlafond: 50_000_000, approvedTenorMonths: bad as number, approvedMarginRate: 12 }, true))
  }
})

test('flat akad: margin must be a number ≥ 0', () => {
  assert.ok(validateApprovedTerms(app, { approvedPlafond: 50_000_000, approvedTenorMonths: 24, approvedMarginRate: null }, true))
  assert.ok(validateApprovedTerms(app, { approvedPlafond: 50_000_000, approvedTenorMonths: 24, approvedMarginRate: -1 }, true))
})

test('profit-share akad: margin must be absent/null', () => {
  assert.equal(
    validateApprovedTerms(app, { approvedPlafond: 50_000_000, approvedTenorMonths: 24, approvedMarginRate: null }, false),
    null,
  )
  assert.ok(validateApprovedTerms(app, { approvedPlafond: 50_000_000, approvedTenorMonths: 24, approvedMarginRate: 10 }, false))
})

test('validateDecisionNote — Conditional/Reject require a non-blank note; Approve does not', () => {
  assert.ok(validateDecisionNote('conditional', '   '), 'blank note rejected for conditional')
  assert.ok(validateDecisionNote('reject', ''), 'blank note rejected for reject')
  assert.equal(validateDecisionNote('conditional', 'Tambahkan agunan tambahan'), null)
  assert.equal(validateDecisionNote('reject', 'DSR di atas ambang'), null)
  // Approve may omit the note (approved terms carry the rationale).
  assert.equal(validateDecisionNote('approve', ''), null)
  assert.equal(validateDecisionNote('approve', '   '), null)
})
