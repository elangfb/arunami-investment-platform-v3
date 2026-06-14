import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { rateLimit, __resetRateLimits, __bucketCount } from './rate-limit'

beforeEach(() => __resetRateLimits())

test('rateLimit — allows up to the limit, then blocks within the window', () => {
  const t0 = 1000
  assert.equal(rateLimit('k', 3, 1000, t0).ok, true)
  assert.equal(rateLimit('k', 3, 1000, t0).ok, true)
  assert.equal(rateLimit('k', 3, 1000, t0).ok, true)
  const blocked = rateLimit('k', 3, 1000, t0 + 100)
  assert.equal(blocked.ok, false)
  assert.ok(blocked.retryAfterSec >= 1)
})

test('rateLimit — budget refreshes after the window elapses', () => {
  rateLimit('k', 1, 1000, 0)
  assert.equal(rateLimit('k', 1, 1000, 500).ok, false) // still inside the window
  assert.equal(rateLimit('k', 1, 1000, 1000).ok, true) // window elapsed
})

test('rateLimit — keys are independent', () => {
  rateLimit('a', 1, 1000, 0)
  assert.equal(rateLimit('a', 1, 1000, 0).ok, false)
  assert.equal(rateLimit('b', 1, 1000, 0).ok, true)
})

test('rateLimit — expired buckets are swept so the Map does not grow unbounded', () => {
  // Many distinct keys at t0, each with a 1s window.
  for (let i = 0; i < 100; i++) rateLimit(`user-${i}`, 5, 1000, 0)
  assert.equal(__bucketCount(), 100)
  // A call well after the window + sweep interval evicts all the now-expired buckets;
  // only the key touched on the sweeping call remains.
  rateLimit('fresh', 5, 1000, 70_000)
  assert.equal(__bucketCount(), 1)
})
