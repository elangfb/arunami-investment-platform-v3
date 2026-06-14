import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_PROMPT_KEYS, DEFAULT_AI_PROMPTS, AI_PROMPT_LABEL } from './ai-prompts'

test('every AI prompt key has a default + a human label', () => {
  for (const key of AI_PROMPT_KEYS) {
    assert.ok(DEFAULT_AI_PROMPTS[key]?.length > 0, `default missing for ${key}`)
    assert.ok(AI_PROMPT_LABEL[key]?.length > 0, `label missing for ${key}`)
  }
})

test('narrative_rsk default includes the extra RSK no-level-or-recommendation guardrail', () => {
  // The RSK draft must instruct the model to keep level + recommendation EMPTY. This is the
  // prompt-layer reinforcement of the in-code scrubNarrative guard.
  assert.match(DEFAULT_AI_PROMPTS.narrative_rsk, /level risiko/i)
  assert.match(DEFAULT_AI_PROMPTS.narrative_rsk, /rekomendasi keputusan/i)
})

test('advisory_rec default returns the structured JSON shape', () => {
  assert.match(DEFAULT_AI_PROMPTS.advisory_rec, /\{ recommendation, rationale \}/)
})

test('all default prompts contain an anti-hallucination guard (jangan/DILARANG + mengarang)', () => {
  for (const key of AI_PROMPT_KEYS) {
    const p = DEFAULT_AI_PROMPTS[key]
    assert.match(p, /(?:DILARANG|jangan)/i, `no "jangan/DILARANG" in ${key}`)
    assert.match(p, /mengarang/i, `no "mengarang" guard in ${key}`)
  }
})
