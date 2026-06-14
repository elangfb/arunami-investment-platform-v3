import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoresFromSnapshot, hasMatrixSignal, LEVEL_SCORE } from './scoring-from-extracted'
import { MATRIX_ASPECTS, type ExtractedSnapshot, type MatrixAspect, type RiskLevel } from './extraction/types'

function snapshot(levels: Partial<Record<MatrixAspect, RiskLevel>>): ExtractedSnapshot {
  return {
    matrix: MATRIX_ASPECTS.map((aspect) => ({
      aspect,
      level: levels[aspect] ?? null,
      finding: '',
      mitigation: '',
    })),
    ratios: [],
    collateral: { marketValue: null, liquidationValue: null, sccrPercent: null },
    racDeviations: [],
  }
}

test('maps each level to its band', () => {
  const s = snapshot({
    character: 'low',
    capacity: 'medium',
    capital: 'low',
    condition: 'medium',
    collateral: 'high',
    sharia_compliance: 'low',
    sharia_structuring: 'low',
  })
  const scores = scoresFromSnapshot(s)
  assert.equal(scores.character, LEVEL_SCORE.low)
  assert.equal(scores.capacity, LEVEL_SCORE.medium)
  assert.equal(scores.collateral, LEVEL_SCORE.high)
  assert.equal(scores.syariah, LEVEL_SCORE.low)
})

test('sharia folds worst-wins (riskier dimension governs)', () => {
  const s = snapshot({ sharia_compliance: 'low', sharia_structuring: 'high' })
  // only syariah resolvable here
  const scores = scoresFromSnapshot(s)
  assert.equal(scores.syariah, LEVEL_SCORE.high) // min(90,45) = 45
})

test('partial matrix → only assessed keys present', () => {
  const s = snapshot({ character: 'low', capacity: 'medium' })
  const scores = scoresFromSnapshot(s)
  assert.deepEqual(Object.keys(scores).sort(), ['capacity', 'character'])
  assert.equal(scores.capital, undefined)
})

test('sharia present if only one dimension assessed', () => {
  const s = snapshot({ sharia_compliance: 'medium' })
  assert.equal(scoresFromSnapshot(s).syariah, LEVEL_SCORE.medium)
})

test('hasMatrixSignal reflects presence of any level', () => {
  assert.equal(hasMatrixSignal(snapshot({ character: 'low' })), true)
  assert.equal(hasMatrixSignal(snapshot({})), false)
})

test('no levels → empty scores', () => {
  assert.deepEqual(scoresFromSnapshot(snapshot({})), {})
})
