import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phaseOf, phaseLabel, PHASE_NAMES, type Stage } from './types'

// Derived 4-phase view over the 6-stage engine (display-only; no engine renumber).
test('phaseOf — 6 stages collapse to 4 phases (1/2/3→1, 4→2, 5→3, 6→4)', () => {
  assert.deepEqual(([1, 2, 3, 4, 5, 6] as Stage[]).map(phaseOf), [1, 1, 1, 2, 3, 4])
})

test('phaseLabel — "Fase N · name"', () => {
  assert.equal(phaseLabel(3), `Fase 1 · ${PHASE_NAMES[1]}`) // feasibility → Inisiasi
  assert.equal(phaseLabel(4), `Fase 2 · ${PHASE_NAMES[2]}`) // risk review
  assert.equal(phaseLabel(5), `Fase 3 · ${PHASE_NAMES[3]}`) // committee
  assert.equal(phaseLabel(6), `Fase 4 · ${PHASE_NAMES[4]}`) // disbursement
})
