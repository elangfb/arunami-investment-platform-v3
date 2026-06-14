import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { isRetryable, withRetry } from './retry'

beforeEach(() => {
  process.env.LOG_SILENT = '1' // mute the retry.transient warn lines
})

test('isRetryable — transient statuses retry, client errors do not', () => {
  assert.equal(isRetryable({ status: 429 }), true)
  assert.equal(isRetryable({ status: 503 }), true)
  assert.equal(isRetryable({ response: { status: 500 } }), true)
  assert.equal(isRetryable({ code: 'ECONNRESET' }), true)
  assert.equal(isRetryable({ status: 400 }), false)
  assert.equal(isRetryable({ status: 401 }), false)
  assert.equal(isRetryable({ status: 404 }), false)
})

test('isRetryable — message-encoded overload/quota retries', () => {
  assert.equal(isRetryable(new Error('The model is overloaded. Please try again later.')), true)
  assert.equal(isRetryable(new Error('429 Resource exhausted (quota)')), true)
  assert.equal(isRetryable(new Error('Invalid argument: bad schema')), false)
})

test('withRetry — succeeds after transient failures', async () => {
  let calls = 0
  const out = await withRetry(
    async () => {
      calls++
      if (calls < 3) throw { status: 503 }
      return 'ok'
    },
    { sleepFn: () => Promise.resolve(), baseMs: 1 },
  )
  assert.equal(out, 'ok')
  assert.equal(calls, 3)
})

test('withRetry — gives up after `retries` and rethrows the last error', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++
          throw { status: 429 }
        },
        { retries: 2, sleepFn: () => Promise.resolve(), baseMs: 1 },
      ),
    (e: { status?: number }) => e.status === 429,
  )
  assert.equal(calls, 3) // first try + 2 retries
})

test('withRetry — does NOT retry a non-retryable error', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++
          throw { status: 400 }
        },
        { sleepFn: () => Promise.resolve() },
      ),
    (e: { status?: number }) => e.status === 400,
  )
  assert.equal(calls, 1)
})

test('withRetry — honors Retry-After header for the delay', async () => {
  const delays: number[] = []
  let calls = 0
  await withRetry(
    async () => {
      calls++
      if (calls < 2) throw { status: 429, response: { headers: { 'retry-after': '2' } } }
      return 'ok'
    },
    { sleepFn: async (ms) => void delays.push(ms), baseMs: 1 },
  )
  assert.deepEqual(delays, [2000]) // 2s from the header, not the 1ms backoff
})
