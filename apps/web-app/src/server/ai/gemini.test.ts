import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isApacLocation, resolveVertexLocation, VERTEX_DEFAULT_LOCATION } from './gemini'

// Compliance-core: Vertex AI data-residency POSTURE. Out-of-region inference (including the
// region-agnostic `global` endpoint) is PERMITTED as an accepted interim (decision 2026.06.08):
// out-of-region inference is acceptable for this deployment. The resolver must NEVER block, but
// must classify out-of-region correctly and emit a loud `ai.region_out_of_apac` warning so Bank
// PII leaving APAC stays visible. This REVERSES the prior fail-closed guard (was: throw).

test('isApacLocation — APAC regions are in-region', () => {
  for (const loc of ['asia-southeast1', 'asia-southeast2', 'asia-south1', 'asia-northeast3', 'australia-southeast1']) {
    assert.equal(isApacLocation(loc), true, `expected ${loc} to be APAC`)
  }
})

test('isApacLocation — non-APAC regions and the `global` endpoint are out-of-region', () => {
  for (const loc of ['us-central1', 'us-east4', 'europe-west1', 'northamerica-northeast1', 'me-west1', 'global', '']) {
    assert.equal(isApacLocation(loc), false, `expected ${loc || '<empty>'} to be out-of-region`)
  }
})

test('VERTEX_DEFAULT_LOCATION is itself APAC-valid', () => {
  assert.equal(isApacLocation(VERTEX_DEFAULT_LOCATION), true)
})

test('resolveVertexLocation — `global` is permitted (no throw) and warns', () => {
  // `global` egresses Bank PII to the US under the accepted interim — allowed, but a loud warn must fire.
  const prev = process.env.GOOGLE_CLOUD_LOCATION
  const origWrite = process.stderr.write.bind(process.stderr)
  const lines: string[] = []
  process.stderr.write = ((s: string | Uint8Array) => { lines.push(String(s)); return true }) as typeof process.stderr.write
  try {
    process.env.GOOGLE_CLOUD_LOCATION = 'global'
    assert.equal(resolveVertexLocation(), 'global')
  } finally {
    process.stderr.write = origWrite
    if (prev === undefined) delete process.env.GOOGLE_CLOUD_LOCATION
    else process.env.GOOGLE_CLOUD_LOCATION = prev
  }
  assert.ok(lines.some((l) => l.includes('ai.region_out_of_apac')), 'expected an out-of-APAC warning')
})

test('resolveVertexLocation — an APAC region passes through unchanged', () => {
  const prev = process.env.GOOGLE_CLOUD_LOCATION
  try {
    process.env.GOOGLE_CLOUD_LOCATION = 'asia-southeast2'
    assert.equal(resolveVertexLocation(), 'asia-southeast2')
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_CLOUD_LOCATION
    else process.env.GOOGLE_CLOUD_LOCATION = prev
  }
})