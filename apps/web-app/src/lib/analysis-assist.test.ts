import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectAnalysisGaps } from './analysis-assist'
import type { LoanApplication } from './types'

// Drift fix (config-inventory.md key finding): the gap-checker must compare hard-gate values
// against the app's RESOLVED risk policy (recompute-live), not a hardcoded 40/70/1 literal.

const positive = 'Penilaian baik dan terkendali.'
function makeApp(over: Partial<LoanApplication>): LoanApplication {
  return {
    financialsAssessed: true,
    kolEntered: true,
    hardGates: { dsr: 45, ltv: 0, kol: 1 },
    analysis: { character: positive, capacity: positive, capital: positive, condition: positive, collateral: positive, syariah: positive, generated: true },
    documents: [],
    extractionSources: {},
    ...over,
  } as unknown as LoanApplication
}

test('gap-check flags DSR breach against the DEFAULT policy when none is attached', () => {
  const gaps = detectAnalysisGaps(makeApp({}))
  const cap = gaps.find((g) => g.aspect === 'capacity')
  assert.ok(cap, 'expected a capacity gap (DSR 45 > default 40)')
  assert.match(cap!.message, /ambang 40%/)
})

test('gap-check respects a RAISED active policy (recompute-live, no hardcoded 40)', () => {
  const gaps = detectAnalysisGaps(makeApp({ riskPolicy: { dsrMaxPct: 50, ltvMaxPct: 70, kolMax: 1 } }))
  assert.equal(gaps.find((g) => g.aspect === 'capacity'), undefined, 'DSR 45 ≤ active max 50 → no gap')
})

test('gap-check respects a TIGHTENED active Kol policy', () => {
  const gaps = detectAnalysisGaps(makeApp({ hardGates: { dsr: 0, ltv: 0, kol: 1 }, riskPolicy: { dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 0 } }))
  // Kol 1 > active max 0 → character + condition positive-narrative gaps surface.
  assert.ok(gaps.some((g) => g.aspect === 'character'), 'Kol 1 > active max 0 should flag character')
})
