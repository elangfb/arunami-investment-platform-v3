import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveColekAssignee, type ColekCandidate } from './colek'

// Pure COLEK first-assignment resolver (RM-led redesign, design Follow-up-decisions "A1 colek").
// Picks who a cross-desk work request lands on: FEWEST active deals; tie → least-recently-assigned
// (oldest lastAssignedAt; a never-assigned user = null lastAssignedAt = most available, wins a tie).
// STICKY per app×desk start-to-end: a present stickyUserId overrides the load-balance so a colek
// re-raised for the same app×desk keeps landing on the same person. PURE + deterministic (no Date.now).

const c = (userId: string, activeDeals: number, lastAssignedAt: string | null): ColekCandidate => ({
  userId,
  name: userId.toUpperCase(),
  activeDeals,
  lastAssignedAt,
})

test('empty candidates → null', () => {
  assert.equal(resolveColekAssignee([]), null)
})

test('fewest active deals wins', () => {
  const r = resolveColekAssignee([c('a', 3, '2026-01-01'), c('b', 1, '2026-01-01'), c('c', 5, '2026-01-01')])
  assert.equal(r?.userId, 'b')
})

test('tie on active deals → least-recently-assigned (oldest lastAssignedAt) wins', () => {
  // both have 2 active deals; b was assigned longer ago → b is more available.
  const r = resolveColekAssignee([c('a', 2, '2026-03-10T00:00:00.000Z'), c('b', 2, '2026-01-05T00:00:00.000Z')])
  assert.equal(r?.userId, 'b')
})

test('null lastAssignedAt (never assigned) wins a tie over an assigned peer', () => {
  const r = resolveColekAssignee([c('a', 2, '2026-01-05T00:00:00.000Z'), c('b', 2, null)])
  assert.equal(r?.userId, 'b')
})

test('sticky id present among candidates overrides the load-balance', () => {
  // a has the fewest deals, but b is sticky → b wins.
  const r = resolveColekAssignee([c('a', 0, null), c('b', 9, '2026-05-01T00:00:00.000Z')], 'b')
  assert.equal(r?.userId, 'b')
})

test('sticky id absent from candidates falls back to load-balance', () => {
  const r = resolveColekAssignee([c('a', 0, null), c('b', 9, '2026-05-01T00:00:00.000Z')], 'gone')
  assert.equal(r?.userId, 'a')
})

test('null/undefined stickyUserId → pure load-balance', () => {
  assert.equal(resolveColekAssignee([c('a', 4, null), c('b', 1, null)], null)?.userId, 'b')
  assert.equal(resolveColekAssignee([c('a', 4, null), c('b', 1, null)], undefined)?.userId, 'b')
})
