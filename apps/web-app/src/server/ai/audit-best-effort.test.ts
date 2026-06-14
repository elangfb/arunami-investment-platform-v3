import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditBestEffort } from './audit-best-effort'

// AI audit = fail-open (decided 2026.06.08): a failed audit write must NEVER deny the user their
// already-generated AI output. The assistant + advisory surfaces route their audit through this
// seam, so this proves the contract for both at once.

// Capture the structured logger's stderr (log.error → stderr) for the duration of `fn`.
async function captureStderr(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = []
  const orig = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((s: string | Uint8Array) => { lines.push(String(s)); return true }) as typeof process.stderr.write
  try {
    await fn()
  } finally {
    process.stderr.write = orig
  }
  return lines
}

test('auditBestEffort — a thrown audit write is swallowed (fail-open) and logged', async () => {
  let returned = false
  const lines = await captureStderr(async () => {
    await auditBestEffort(
      () => Promise.reject(new Error('db down')),
      'assistant.audit_failed',
      { surface: 'assistant', appId: 'APP-1' },
    )
    // Reaching here proves the helper did NOT propagate the rejection.
    returned = true
  })
  assert.equal(returned, true, 'caller continues despite the audit-write rejection')
  const log = lines.find((l) => l.includes('assistant.audit_failed'))
  assert.ok(log, 'logged the surface audit_failed key')
  assert.ok(log!.includes('"surface":"assistant"') && log!.includes('"appId":"APP-1"'), 'carries non-PII context')
  assert.ok(log!.includes('db down'), 'carries the underlying error message')
})

test('auditBestEffort — a successful audit write does not log an error', async () => {
  let wrote = false
  const lines = await captureStderr(async () => {
    await auditBestEffort(
      async () => { wrote = true },
      'advisory.audit_failed',
      { appId: 'APP-2' },
    )
  })
  assert.equal(wrote, true, 'the write ran')
  assert.equal(lines.some((l) => l.includes('advisory.audit_failed')), false, 'no audit_failed on success')
})
