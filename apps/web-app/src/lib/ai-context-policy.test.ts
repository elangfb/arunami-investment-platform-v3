import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextPolicyFor } from './ai-context-policy'
import type { AiSurface } from '@/server/ai/audit'

// Per-surface AI-context policy (RM-led redesign §5 / Topic 5). The non-negotiable correctness pin:
// extract NEVER receives customer/app memory (cross-deal contamination).

test('extract → ALL FALSE (NON-NEGOTIABLE: no cross-deal memory in the transcriber)', () => {
  assert.deepEqual(contextPolicyFor('extract'), { derived: false, customer: false, app: false })
})

test('research → CUSTOMER ONLY (external fetch — derived/app are noise/leak)', () => {
  assert.deepEqual(contextPolicyFor('research'), { derived: false, customer: true, app: false })
})

test('the 5 grounded surfaces → ALL 3 layers (derived + customer + app)', () => {
  const all3: AiSurface[] = ['narrative', 'advisory', 'assistant', 'bureau', 'discussion']
  for (const s of all3) {
    assert.deepEqual(contextPolicyFor(s), { derived: true, customer: true, app: true }, `${s} → all 3`)
  }
})

test('every AiSurface has a policy (no surface silently defaults to undefined)', () => {
  const surfaces: AiSurface[] = ['discussion', 'assistant', 'advisory', 'research', 'narrative', 'bureau', 'extract']
  for (const s of surfaces) {
    const p = contextPolicyFor(s)
    assert.equal(typeof p.derived, 'boolean', `${s} derived defined`)
    assert.equal(typeof p.customer, 'boolean', `${s} customer defined`)
    assert.equal(typeof p.app, 'boolean', `${s} app defined`)
  }
})
