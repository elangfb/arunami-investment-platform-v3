// DETERMINISTIC COMPLIANCE GATE — the zero-tolerance, zero-network regression that locks
// Mizan's AI invariants in place BEFORE any model or provider swap. It reuses the PRODUCTION
// seams (not re-implementations) as assertions over a golden set:
//   • no-authoritative-output  → scrubNarrative drops every verdict/risk-level
//   • PII-masked-before-egress → maskForEgress masks known + stray PII, detectResidualPii clean
//   • injection defense-in-depth → an injected verdict in model OUTPUT is still scrubbed
//   • structural → the narrative token set carries no level/recommendation key
//
// Runs via `pnpm eval` (and CI). Model QUALITY (does the model obey? grounding/faithfulness)
// is the SEPARATE Promptfoo + RAGAS gate (eval/promptfoo) which needs a live model endpoint —
// never gate compliance on an LLM judge. See eval/README.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// Import scrubNarrative from its leaf module (narrative.ts only re-exports it) so this
// zero-network gate stays hermetic — narrative.ts transitively pulls in ai/audit + config
// which load server/db.ts (throws at import without DATABASE_URL). Same production function.
import { scrubNarrative } from '@/server/ai/narrative-scrub'
import { maskForEgress } from '@/server/ai/redact'
import { detectResidualPii, piiSecrets } from '@/lib/pii-mask'
import { MUAP_NARRATIVE_TOKENS, RSK_NARRATIVE_TOKENS } from '@/server/docs/seed'

// This gate's job is to PROVE the masked-egress invariant holds — i.e. the behavior at OJK W1 /
// production, where masking is ON. The runtime default `PII_MASK_ENABLED` is OFF (compliance is
// PARKED — see CLAUDE.md "Build posture"), under which `maskForEgress` is a deliberate pass-through;
// asserting masking against that no-op would prove nothing. So this gate — and ONLY this gate —
// force-enables masking for its own process. This is NOT the "don't set PII_MASK_ENABLED in dev/tests"
// footgun: `pnpm eval` runs solely `eval/guardrails/*` in its own process, isolated from `pnpm
// test:unit` and the app runtime, both of which keep the parked-default pass-through.
process.env.PII_MASK_ENABLED = '1'

function golden<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../golden/${name}`, import.meta.url), 'utf8')) as T
}

type DocKind = 'muap' | 'rsk'

// ── 1. No authoritative output ────────────────────────────────────────────────────
const narr = golden<{
  mustDrop: { docKind: DocKind; field: string; text: string; why: string }[]
  mustKeep: { docKind: DocKind; field: string; text: string; why: string }[]
}>('narrative-guardrails.json')

for (const c of narr.mustDrop) {
  test(`scrubNarrative DROPS ${c.docKind}.${c.field} — ${c.why}`, () => {
    const { fields } = scrubNarrative({ [c.field]: c.text }, c.docKind)
    assert.equal(fields[c.field], undefined, `must be dropped: "${c.text}"`)
  })
}

for (const c of narr.mustKeep) {
  test(`scrubNarrative KEEPS ${c.docKind}.${c.field} — ${c.why}`, () => {
    const { fields } = scrubNarrative({ [c.field]: c.text }, c.docKind)
    assert.equal(fields[c.field], c.text.trim(), `must be kept: "${c.text}"`)
  })
}

// ── 2. PII masked before egress ────────────────────────────────────────────────────
const pii = golden<{
  secrets: Record<string, string>
  mustMask: { text: string; forbidden: string[] }[]
  strayPii: { text: string; expectMaskedLabel: string; forbidden: string[] }[]
}>('pii-egress.json')

const secrets = piiSecrets(pii.secrets)

for (const [i, c] of pii.mustMask.entries()) {
  test(`maskForEgress removes known PII + reports no residual (case ${i + 1})`, () => {
    const { masked, residual } = maskForEgress(c.text, secrets)
    for (const f of c.forbidden) assert.ok(!masked.includes(f), `leaked "${f}" in: ${masked}`)
    assert.deepEqual(residual, [], `residual must be empty, got ${residual.join(',')}`)
  })
}

for (const [i, c] of pii.strayPii.entries()) {
  test(`maskForEgress masks stray structured PII not in secrets (case ${i + 1})`, () => {
    const { masked, residual } = maskForEgress(c.text, secrets)
    for (const f of c.forbidden) assert.ok(!masked.includes(f), `leaked stray "${f}" in: ${masked}`)
    assert.ok(masked.includes(c.expectMaskedLabel), `expected ${c.expectMaskedLabel} in: ${masked}`)
    assert.deepEqual(residual, [], 'masked → no residual')
  })
}

test('detectResidualPii fails CLOSED on unmasked known PII (regression backstop)', () => {
  // Raw (un-masked) text: the backstop must flag it so the egress path can refuse.
  const hits = detectResidualPii('NIK 3201234567890123 telp 081234567890', secrets)
  assert.ok(hits.includes('[NIK]') && hits.includes('[TELEPON]'), `expected NIK+TELEPON, got ${hits.join(',')}`)
})

// ── 3. Injection defense-in-depth ──────────────────────────────────────────────────
const inj = golden<{ verdictBearing: string[]; levelBearing: string[]; benign: string[] }>('injection.json')

for (const [i, text] of inj.verdictBearing.entries()) {
  test(`scrubNarrative drops an injected DECISION VERDICT in both docs (case ${i + 1})`, () => {
    // A decision verdict is forbidden everywhere → dropped in MUAP and RSK alike.
    assert.equal(scrubNarrative({ m_syariah: text }, 'muap').fields.m_syariah, undefined)
    assert.equal(scrubNarrative({ r_kesimpulan: text }, 'rsk').fields.r_kesimpulan, undefined)
  })
}

for (const [i, text] of inj.levelBearing.entries()) {
  test(`scrubNarrative drops an injected RISK LEVEL in RSK (case ${i + 1})`, () => {
    // Risk levels are RSK's domain — the RSK scrub drops them. (MUAP narrative is allowed
    // incidental level words, so the level ban there rests on the schema-no-key + the prompt.)
    assert.equal(scrubNarrative({ r_kesimpulan: text }, 'rsk').fields.r_kesimpulan, undefined)
  })
}

// ── 4. Structural: no level/recommendation token exists ────────────────────────────
test('narrative token set has NO level/recommendation key (model cannot author one)', () => {
  const forbidden = /(level|rating|reko|recommend|verdict|keputusan|skor|score|disetujui|ditolak)/i
  const all = [...MUAP_NARRATIVE_TOKENS, ...RSK_NARRATIVE_TOKENS]
  const offenders = all.filter((t) => forbidden.test(t))
  assert.deepEqual(offenders, [], `unexpected authoritative token(s): ${offenders.join(', ')}`)
  assert.ok(all.length > 0, 'token set is non-empty (guard is actually exercising it)')
})
