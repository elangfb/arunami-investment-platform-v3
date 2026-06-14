import 'server-only'

import { loadCascadeForSurface } from './context-layers'
import type { AiSurface } from './audit'
import type { LoanApplication } from '@/lib/types'

// The ONE idiom for injecting the layered AI context into a grounded surface's user prompt
// (RM-led redesign §5 / Topic 5): load the per-surface gated cascade, then APPEND it at the END of
// the user prompt — BEFORE maskForEgress at the call site, and NEVER into the system instruction
// (the system prompt is never masked, so PII must not be injected there). A surface that gets nothing
// (extract → all-false) or an all-empty cascade adds nothing, so callers append unconditionally.

const SEP = '\n\n────────────────────────\n'

/**
 * Append the per-surface gated context cascade to the end of `userPrompt`. Returns the prompt
 * unchanged when the cascade is empty. The caller passes the resulting string to maskForEgress.
 *
 * ⚠️ research: the granted customer layer egresses to the public internet — the research site must
 * pass REAL piiSecrets to its maskForEgress (so the appended customer "Catatan" PII is masked).
 */
export async function appendCascade(userPrompt: string, app: LoanApplication, surface: AiSurface): Promise<string> {
  const cascade = await loadCascadeForSurface(app, surface)
  return cascade ? `${userPrompt}${SEP}${cascade}` : userPrompt
}
