import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routingAllowsActor, validateRoutingConfig, parseRoutingMap, type RoutingMap } from './approval-routing'

// Safety-critical: routing NARROWS who may sign a configured rung; it must never widen authority,
// and the four-eyes/SoD pre-checks must reject obviously-bad config. (The engine desk gate +
// validateAction remain the backstops; these tests cover the routing layer in isolation.)

const MUAP_ROUTE: RoutingMap = { 'muap-approve-tl': 'u-tl' }

test('routingAllowsActor — configured rung: ONLY the routed account may sign', () => {
  assert.equal(routingAllowsActor(MUAP_ROUTE, 'muap-approve-tl', 'u-tl', false), true, 'routed TL allowed')
  assert.equal(routingAllowsActor(MUAP_ROUTE, 'muap-approve-tl', 'u-other-tl', false), false, 'a different desk holder is blocked')
})

test('routingAllowsActor — unconfigured rung falls back to all holders (allowed)', () => {
  assert.equal(routingAllowsActor(null, 'muap-approve-tl', 'anyone', false), true, 'no rule at all → allowed')
  assert.equal(routingAllowsActor({}, 'muap-approve-tl', 'anyone', false), true, 'empty map → allowed')
  assert.equal(routingAllowsActor(MUAP_ROUTE, 'rsk-approve-rtl', 'anyone', false), true, 'a rung absent from the map → allowed')
})

test('routingAllowsActor — superadmin break-glass always allowed (ADR-0010)', () => {
  assert.equal(routingAllowsActor(MUAP_ROUTE, 'muap-approve-tl', 'u-superadmin', true), true)
})

test('validateRoutingConfig — rejects routing a rung to the maker (self-approval)', () => {
  const problems = validateRoutingConfig('muap', 'u-maker', { 'muap-approve-tl': 'u-maker' })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /pembuat/)
})

test('validateRoutingConfig — single-checker chains: a second key is a foreign rung, not a "dua rung" dup', () => {
  // Every chain now has exactly ONE checker rung, so the distinct-approver dup check cannot trip
  // with valid keys — a same-account "second rung" is rejected as a non-checker key first. The
  // maker self-route rejection on the valid rung still fires alongside it (four-eyes).
  const problems = validateRoutingConfig('muap', 'u-maker', { 'muap-approve-tl': 'u-maker', 'rsk-approve-rtl': 'u-maker' } as RoutingMap)
  assert.ok(problems.some((p) => /pembuat/.test(p)), 'self-route on the valid rung is rejected')
  assert.ok(problems.some((p) => /bukan tahap checker/.test(p)), 'the foreign rung is rejected as non-checker')
  assert.ok(!problems.some((p) => /dua rung/.test(p)), 'no dup-rung error — the foreign key never reaches the dup check')
})

test('validateRoutingConfig — rejects a non-checker rung key (author / foreign chain)', () => {
  const author = validateRoutingConfig('muap', 'u-maker', { 'muap-author': 'u-x' } as RoutingMap)
  assert.ok(author.some((p) => /bukan tahap checker/.test(p)))
  const foreign = validateRoutingConfig('muap', 'u-maker', { 'rsk-approve-rtl': 'u-x' } as RoutingMap)
  assert.ok(foreign.some((p) => /bukan tahap checker/.test(p)))
})

test('validateRoutingConfig — a clean distinct mapping is valid', () => {
  assert.deepEqual(validateRoutingConfig('muap', 'u-maker', MUAP_ROUTE), [])
  assert.deepEqual(validateRoutingConfig('rsk', 'u-ra', { 'rsk-approve-rtl': 'u-rtl' }), [])
})

test('parseRoutingMap — keeps only non-empty string approvers on the chain checker rungs', () => {
  // 'muap-approve-bm' is a REMOVED legacy rung — a stale DB row carrying it must parse as junk.
  const json = { 'muap-approve-tl': 'u-tl', 'muap-approve-bm': 'u-stale', 'muap-author': 'u-maker', 'rsk-approve-rtl': 'u-rtl', junk: 42 }
  assert.deepEqual(parseRoutingMap(json, 'muap'), { 'muap-approve-tl': 'u-tl' })
  assert.deepEqual(parseRoutingMap({ 'rsk-approve-rtl': '  ' }, 'rsk'), {}, 'blank string → dropped (unconfigured)')
})

test('parseRoutingMap — malformed input is fail-safe → {} (→ fallback)', () => {
  assert.deepEqual(parseRoutingMap(null, 'muap'), {})
  assert.deepEqual(parseRoutingMap('nope', 'rsk'), {})
  assert.deepEqual(parseRoutingMap([1, 2], 'muap'), {})
})
