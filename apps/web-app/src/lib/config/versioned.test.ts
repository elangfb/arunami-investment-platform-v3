import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveActiveVersion } from './versioned'

const d = (s: string) => new Date(s)
const row = (version: number, effectiveFrom: string) => ({ version, effectiveFrom: d(effectiveFrom) })

test('resolveActiveVersion — picks the highest version that is already effective', () => {
  const rows = [row(1, '2026-01-01'), row(2, '2026-03-01'), row(3, '2026-06-01')]
  assert.equal(resolveActiveVersion(rows, d('2026-04-01'))?.version, 2) // v3 not yet effective
  assert.equal(resolveActiveVersion(rows, d('2026-06-01'))?.version, 3) // boundary = inclusive
  assert.equal(resolveActiveVersion(rows, d('2030-01-01'))?.version, 3) // far future → latest
})

test('resolveActiveVersion — ignores future-dated versions even if higher', () => {
  const rows = [row(1, '2026-01-01'), row(5, '2027-01-01')]
  assert.equal(resolveActiveVersion(rows, d('2026-06-01'))?.version, 1)
})

test('resolveActiveVersion — none effective yet → undefined', () => {
  assert.equal(resolveActiveVersion([row(1, '2027-01-01')], d('2026-01-01')), undefined)
  assert.equal(resolveActiveVersion([], d('2026-01-01')), undefined)
})

test('resolveActiveVersion — order-independent (highest version wins, not array order)', () => {
  const rows = [row(3, '2026-01-03'), row(1, '2026-01-01'), row(2, '2026-01-02')]
  assert.equal(resolveActiveVersion(rows, d('2026-02-01'))?.version, 3)
})
