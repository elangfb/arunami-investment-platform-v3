import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { isCronAuthorized } from './cron'

// Hermetic tests for the cron trigger auth. The security contract: FAIL-CLOSED when CRON_SECRET is
// unset, accept the secret via Bearer or X-Cron-Secret, reject everything else.

const ORIGINAL = process.env.CRON_SECRET
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL
})

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://app.example/api/cron/materialize-meetings', { method: 'POST', headers })
}

test('fail-closed: rejects when CRON_SECRET is unset (even with a token)', () => {
  delete process.env.CRON_SECRET
  assert.equal(isCronAuthorized(reqWith({ authorization: 'Bearer anything' })), false)
})

test('accepts the correct secret via Authorization: Bearer', () => {
  process.env.CRON_SECRET = 's3cr3t-token'
  assert.equal(isCronAuthorized(reqWith({ authorization: 'Bearer s3cr3t-token' })), true)
})

test('accepts the correct secret via X-Cron-Secret header', () => {
  process.env.CRON_SECRET = 's3cr3t-token'
  assert.equal(isCronAuthorized(reqWith({ 'x-cron-secret': 's3cr3t-token' })), true)
})

test('rejects a wrong secret', () => {
  process.env.CRON_SECRET = 's3cr3t-token'
  assert.equal(isCronAuthorized(reqWith({ authorization: 'Bearer wrong' })), false)
  assert.equal(isCronAuthorized(reqWith({ 'x-cron-secret': 'wrong' })), false)
})

test('rejects a request with no credential', () => {
  process.env.CRON_SECRET = 's3cr3t-token'
  assert.equal(isCronAuthorized(reqWith({})), false)
})

test('rejects a malformed Authorization header (no Bearer prefix)', () => {
  process.env.CRON_SECRET = 's3cr3t-token'
  assert.equal(isCronAuthorized(reqWith({ authorization: 's3cr3t-token' })), false)
})
