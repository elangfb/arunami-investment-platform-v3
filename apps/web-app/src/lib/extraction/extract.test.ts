import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extract, type DocResolvers, type MarkerResolver } from './extract'
import { MATRIX_ASPECTS, RATIO_KEYS } from './types'

// Build resolvers from plain content maps. A key present with a string => found
// (named range or sentinel); absent => null (anchor not present).
function resolver(named: Record<string, string>, sentinel: Record<string, string> = {}): MarkerResolver {
  return {
    namedRange: (n) => (n in named ? named[n] : null),
    sentinel: (n) => (n in sentinel ? sentinel[n] : null),
  }
}

function fullRskNamed(): Record<string, string> {
  const m: Record<string, string> = {}
  for (const a of MATRIX_ASPECTS) {
    m[`${a}_level`] = 'Sedang'
    m[`${a}_finding`] = `temuan ${a}`
    m[`${a}_mitigation`] = `mitigasi ${a}`
  }
  return m
}

function fullMuapNamed(): Record<string, string> {
  const m: Record<string, string> = {}
  m['fin_period_0'] = '2023'
  m['fin_period_1'] = '2024'
  m['fin_period_2'] = 'Apr-2025'
  for (const k of RATIO_KEYS) for (const i of [0, 1, 2]) m[`ratio_${k}_${i}`] = '1,2x'
  m['collateral_market_value'] = 'Rp 3.000.000.000'
  m['collateral_liquidation_value'] = 'Rp 2.550.000.000'
  m['collateral_sccr_pct'] = '102,21%'
  return m
}

function fullResolvers(over: Partial<{ rskNamed: Record<string, string>; muapNamed: Record<string, string> }> = {}): DocResolvers {
  return {
    rsk: resolver(over.rskNamed ?? fullRskNamed()),
    muap: resolver(over.muapNamed ?? fullMuapNamed()),
  }
}

test('happy path: full valid docs → ok, snapshot populated', () => {
  const { report, snapshot } = extract(fullResolvers(), { runId: 'r1', now: () => new Date('2026-05-22T00:00:00Z') })
  assert.equal(report.ok, true)
  assert.ok(snapshot)
  assert.equal(snapshot!.matrix.length, 7)
  assert.ok(snapshot!.matrix.every((r) => r.level === 'medium'))
  assert.equal(snapshot!.matrix[0].finding, 'temuan character')
  assert.equal(snapshot!.collateral.sccrPercent, 102.21)
  // RAC deviations are read structurally from the doc (server adapter), not the
  // pure engine — so the engine leaves them empty here.
  assert.equal(snapshot!.racDeviations.length, 0)
  const dscri = snapshot!.ratios.find((r) => r.key === 'dscri')!
  assert.equal(dscri.points.length, 3)
  assert.equal(dscri.points[0].period, '2023')
  assert.equal(dscri.points[2].period, 'Apr-2025')
  assert.ok(dscri.points.every((p) => p.value === 1.2))
  assert.equal(dscri.sourceDoc, 'muap')
  assert.equal(report.runId, 'r1')
})

test('sentinel fallback when named range absent', () => {
  const rsk = fullRskNamed()
  delete rsk['capacity_level'] // remove from named ranges
  const resolvers: DocResolvers = {
    rsk: resolver(rsk, { capacity_level: 'Tinggi' }), // present only as sentinel
    muap: resolver(fullMuapNamed()),
  }
  const { report, snapshot } = extract(resolvers)
  assert.equal(report.ok, true)
  assert.ok(snapshot)
  const cap = report.fields.find((f) => f.fieldKey === 'capacity_level')!
  assert.equal(cap.status, 'ok')
  assert.equal(cap.source, 'sentinel')
  assert.equal(snapshot!.matrix.find((r) => r.aspect === 'capacity')!.level, 'high')
})

test('missing gating anchor → snapshot rejected', () => {
  const rsk = fullRskNamed()
  delete rsk['collateral_level']
  const { report, snapshot } = extract(fullResolvers({ rskNamed: rsk }))
  assert.equal(report.ok, false)
  assert.equal(snapshot, null)
  const f = report.fields.find((x) => x.fieldKey === 'collateral_level')!
  assert.equal(f.status, 'missing_anchor')
  assert.match(f.message!, /tidak ditemukan/)
})

test('unparseable gating level → snapshot rejected', () => {
  const rsk = fullRskNamed()
  rsk['character_level'] = 'belum dinilai'
  const { report, snapshot } = extract(fullResolvers({ rskNamed: rsk }))
  assert.equal(report.ok, false)
  assert.equal(snapshot, null)
  const f = report.fields.find((x) => x.fieldKey === 'character_level')!
  assert.equal(f.status, 'parse_failed')
})

test('ratios: a missing middle-column value keeps the point with value null', () => {
  const muap = fullMuapNamed()
  delete muap['ratio_dscri_1'] // 2024 value missing, but the 2024 header remains
  const { snapshot } = extract(fullResolvers({ muapNamed: muap }))
  assert.ok(snapshot)
  const dscri = snapshot!.ratios.find((r) => r.key === 'dscri')!
  assert.equal(dscri.points.length, 3)
  assert.equal(dscri.points[1].period, '2024')
  assert.equal(dscri.points[1].value, null)
  assert.equal(dscri.points[0].value, 1.2)
})

test('ratios: a fully-blank period column (no header, no value) is dropped', () => {
  const muap = fullMuapNamed()
  delete muap['fin_period_2']
  for (const k of RATIO_KEYS) delete muap[`ratio_${k}_2`]
  const { snapshot } = extract(fullResolvers({ muapNamed: muap }))
  assert.ok(snapshot)
  assert.equal(snapshot!.ratios.find((r) => r.key === 'dscri')!.points.length, 2)
})

test('empty non-gating field does not block', () => {
  const rsk = fullRskNamed()
  rsk['character_finding'] = '   '
  const { report, snapshot } = extract(fullResolvers({ rskNamed: rsk }))
  assert.equal(report.ok, true)
  assert.ok(snapshot)
  assert.equal(report.fields.find((f) => f.fieldKey === 'character_finding')!.status, 'empty')
  assert.equal(snapshot!.matrix.find((r) => r.aspect === 'character')!.finding, '')
})
