// Bridge: Gate 2 (Promptfoo quality eval) reuses the EXACT production compliance guards, so a
// model output that reads well but smuggles a verdict/level or leaks PII still FAILS the eval.
// Promptfoo calls a default-exported function assertion (file://assert-compliance.ts) per case.
// Runs under the same tsx/tsconfig.test.json resolution as `pnpm eval` (so `@/` + server-only
// resolve). Active only when Promptfoo + a model endpoint are present — see eval/README.md.

import { scrubNarrative } from '@/server/ai/narrative'
import { detectResidualPii, piiSecrets } from '@/lib/pii-mask'

interface AssertContext {
  vars?: Record<string, unknown>
}
interface GradingResult {
  pass: boolean
  score: number
  reason: string
}

// `output` is the model's text for one narrative field. `vars.docKind` + `vars.field` + the
// application's PII (vars.secrets) come from the test case. Fail-closed on any violation.
export default function assertCompliance(output: string, context: AssertContext): GradingResult {
  const docKind = (context.vars?.docKind as 'muap' | 'rsk') ?? 'muap'
  const field = (context.vars?.field as string) ?? 'm_ringkasan_usulan'
  const secrets = piiSecrets((context.vars?.secrets as Record<string, string>) ?? {})

  const residual = detectResidualPii(output, secrets)
  if (residual.length) {
    return { pass: false, score: 0, reason: `PII leak (unmasked): ${residual.join(', ')}` }
  }
  const { fields } = scrubNarrative({ [field]: output }, docKind)
  if (fields[field] === undefined) {
    return { pass: false, score: 0, reason: `authoritative output (verdict/level) detected for ${field}` }
  }
  return { pass: true, score: 1, reason: 'compliance invariants upheld' }
}
