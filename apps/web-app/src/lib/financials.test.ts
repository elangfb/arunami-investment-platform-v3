import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTotalMargin, computeInstallment, computeHardGates, type HardGateComputeInput } from './financials'

// Compliance-core: the DSR/LTV numbers these produce drive the OJK hard gates.

test('computeTotalMargin — plafond × rate/yr × years', () => {
  // 120M at 10%/yr over 12 months = 12M
  assert.equal(computeTotalMargin(120_000_000, 12, 10), 12_000_000)
  // 24 months doubles it
  assert.equal(computeTotalMargin(120_000_000, 24, 10), 24_000_000)
  // 0% margin → 0
  assert.equal(computeTotalMargin(120_000_000, 12, 0), 0)
})

test('computeInstallment — (plafond + total margin) / tenor, rounded', () => {
  // (120M + 12M) / 12 = 11M
  assert.equal(computeInstallment(120_000_000, 12, 10), 11_000_000)
  // non-positive tenor → 0 (no divide-by-zero)
  assert.equal(computeInstallment(120_000_000, 0, 10), 0)
})

const base: HardGateComputeInput = {
  requestedPlafond: 120_000_000,
  requestedTenorMonths: 12,
  akadType: 'Murabahah',
  netMonthlyIncome: 25_000_000,
  existingMonthlyObligations: 0,
  collateralAppraisedValue: 150_000_000,
  marginRate: 10,
}

test('computeHardGates — flat akad uses the computed installment as DSR numerator', () => {
  const { dsr, ltv, installment } = computeHardGates(base)
  assert.equal(installment, 11_000_000)
  assert.equal(dsr, 44) // round(11M / 25M * 100)
  assert.equal(ltv, 80) // round(120M / 150M * 100)
})

test('computeHardGates — existing obligations add to the DSR numerator', () => {
  const { dsr } = computeHardGates({ ...base, existingMonthlyObligations: 2_000_000 })
  assert.equal(dsr, 52) // round((2M + 11M) / 25M * 100)
})

test('computeHardGates — profit-share akad uses projected profit share, installment 0', () => {
  const { dsr, installment } = computeHardGates({
    ...base,
    akadType: 'Musyarakah',
    marginRate: null,
    projectedMonthlyProfitShare: 5_000_000,
  })
  assert.equal(installment, 0)
  assert.equal(dsr, 20) // round(5M / 25M * 100)
})

test('computeHardGates — zero income / zero collateral guard against divide-by-zero', () => {
  const { dsr } = computeHardGates({ ...base, netMonthlyIncome: 0 })
  assert.equal(dsr, 0)
  const { ltv } = computeHardGates({ ...base, collateralAppraisedValue: 0 })
  assert.equal(ltv, 0)
})
