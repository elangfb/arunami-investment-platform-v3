import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCustomerDedup, type DedupCandidate } from './customer-dedup'

// Pure dedup resolver — a SOFT NUDGE on create, never a hard block.
// individual → exact NIK match; business → exact NPWP match (NIB secondary).
// Identity compared as TRIMMED STRINGS, never Number() (a 16-digit NIK exceeds 2^53 →
// distinct NIKs would collide as the same double — mirrors lib/extraction-registry.ts
// extractionValuesEqual).

const indCandidate: DedupCandidate = { id: 'CUST-1', type: 'individual', nik: '3201010101010001' }
const bizCandidate: DedupCandidate = { id: 'CUST-2', type: 'business', npwp: '012345678901234', nib: '1234567890123' }

test('individual — exact NIK match returns the candidate', () => {
  const r = resolveCustomerDedup({ type: 'individual', nik: '3201010101010001' }, [indCandidate, bizCandidate])
  assert.deepEqual(r.matches.map((m) => m.id), ['CUST-1'])
  assert.equal(r.reason, 'nik')
})

test('individual — no NIK match returns empty matches', () => {
  const r = resolveCustomerDedup({ type: 'individual', nik: '3201019999999999' }, [indCandidate, bizCandidate])
  assert.deepEqual(r.matches, [])
  assert.equal(r.reason, 'none')
})

test('business — exact NPWP match returns the candidate', () => {
  const r = resolveCustomerDedup({ type: 'business', npwp: '012345678901234' }, [indCandidate, bizCandidate])
  assert.deepEqual(r.matches.map((m) => m.id), ['CUST-2'])
  assert.equal(r.reason, 'npwp')
})

test('business — NIB secondary match when NPWP absent', () => {
  const r = resolveCustomerDedup({ type: 'business', nib: '1234567890123' }, [indCandidate, bizCandidate])
  assert.deepEqual(r.matches.map((m) => m.id), ['CUST-2'])
  assert.equal(r.reason, 'nib')
})

test('near-collision 16-digit NIKs do NOT falsely match (string compare, not Number)', () => {
  // These two differ only in the last digit; as IEEE-754 doubles both round to the same value.
  const a = '9171000000000000'
  const b = '9171000000000001'
  assert.notEqual(a, b)
  assert.equal(Number(a), Number(b), 'precondition: Number() collides these two NIKs')
  const r = resolveCustomerDedup({ type: 'individual', nik: a }, [{ id: 'CUST-X', type: 'individual', nik: b }])
  assert.deepEqual(r.matches, [], 'distinct NIKs must not match despite float collision')
  assert.equal(r.reason, 'none')
})

test('whitespace is trimmed before comparing identity', () => {
  const r = resolveCustomerDedup({ type: 'individual', nik: '  3201010101010001 ' }, [indCandidate])
  assert.deepEqual(r.matches.map((m) => m.id), ['CUST-1'])
})

test('missing query identity returns no matches (cannot nudge without a key)', () => {
  const r = resolveCustomerDedup({ type: 'individual' }, [indCandidate])
  assert.deepEqual(r.matches, [])
  assert.equal(r.reason, 'none')
})

test('type isolation — an individual query never matches a business candidate sharing a digit string', () => {
  const r = resolveCustomerDedup({ type: 'individual', nik: '012345678901234' }, [bizCandidate])
  assert.deepEqual(r.matches, [])
})
