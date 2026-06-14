// Per-surface AI-context policy (RM-led redesign §5 / Topic 5). Which of the three layered-context
// tracks each AI surface is allowed to receive — NOT a global append. This is the policy table the
// injection sites consult before assembling the cascade (lib/ai-context-cascade.ts).
//
// Three layers (broad → narrow), modeled like AGENTS.md:
//   • derived  — the AUTO block (app facts + prior-deal carry-forward), regenerated live.
//   • customer — Customer.contextMd (Nasabah-scoped human "Catatan", ≈ root AGENTS.md).
//   • app      — Application.contextMd (app-scoped human "Catatan", ≈ app-local AGENTS.md).
//
// Pure (no server-only / no prisma) — unit-tested in ai-context-policy.test.ts. `AiSurface` is a
// compile-time type-only import from the server-only audit module (erased at runtime, so this stays
// a pure lib module).

import type { AiSurface } from '@/server/ai/audit'

export interface ContextPolicy {
  /** The AUTO derived block (app facts + prior-deal outcomes). */
  derived: boolean
  /** Customer-scoped human "Catatan" (Customer.contextMd). */
  customer: boolean
  /** App-scoped human "Catatan" (Application.contextMd). */
  app: boolean
}

const ALL: ContextPolicy = { derived: true, customer: true, app: true }
const NONE: ContextPolicy = { derived: false, customer: false, app: false }

// The policy table. Centralised so a surface's context grant is one decodeable place.
const POLICY: Record<AiSurface, ContextPolicy> = {
  // Grounded in-Mizan reasoning surfaces — get the full cascade (broad → narrow).
  narrative: ALL,
  advisory: ALL,
  assistant: ALL,
  bureau: ALL,
  discussion: ALL,
  // research EGRESSES TO THE PUBLIC INTERNET. Prior Mizan outcomes (the derived block) are noise for
  // external fetch, so skip them; the customer "Catatan" can carry useful identity/business framing.
  // ⚠️ CRITICAL: when the customer layer is injected for research, the surface MUST pass REAL
  // piiSecrets at its maskForEgress so contextMd PII is masked — never leak names to the public synth.
  research: { derived: false, customer: true, app: false },
  // extract gets NOTHING. ⚠️ NON-NEGOTIABLE correctness rule (cross-deal contamination): injecting
  // ANY customer/app memory risks the extractor carrying a prior deal's value into the current doc's
  // transcription. The extractor reads ONLY the document text. Pinned by test.
  extract: NONE,
}

/** The context-layer grant for a surface. See the POLICY table above for the rationale per surface. */
export function contextPolicyFor(surface: AiSurface): ContextPolicy {
  return POLICY[surface]
}
