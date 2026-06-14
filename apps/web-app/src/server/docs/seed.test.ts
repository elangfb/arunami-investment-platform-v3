import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeTokens, assertNoLeftoverTokens, MUAP_NARRATIVE_TOKENS, RSK_NARRATIVE_TOKENS } from './seed'

test('assertSafeTokens accepts the narrative token sets', () => {
  assert.doesNotThrow(() => assertSafeTokens([...MUAP_NARRATIVE_TOKENS, ...RSK_NARRATIVE_TOKENS]))
})

test('assertSafeTokens rejects a forbidden (gating) token', () => {
  assert.throws(() => assertSafeTokens(['m_character', 'character_level']), /forbidden/i)
  assert.throws(() => assertSafeTokens(['rekomendasi']), /forbidden/i)
})

test('narrative tokens never name a gating field (level/recommendation/verdict)', () => {
  const all = [...MUAP_NARRATIVE_TOKENS, ...RSK_NARRATIVE_TOKENS]
  assert.ok(all.every((t) => !/level|reko|recommend|verdict|disetujui|ditolak/i.test(t)))
})

test('assertNoLeftoverTokens catches a stray {{token}}', () => {
  assert.throws(() => assertNoLeftoverTokens('Plafond: {{plafond}} belum terisi'), /Unfilled tokens/)
})

test('assertNoLeftoverTokens ignores ${{…}} extraction sentinels', () => {
  assert.doesNotThrow(() => assertNoLeftoverTokens('Sentinel ${{character_finding}} hidden'))
})
