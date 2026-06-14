/**
 * MUAP/RSK v2 template token registry — type definitions.
 *
 * See `docs/designs/muap-template-engine-v2.md` for design.
 * Walkthroughs: `docs/designs/muap-v2-tokenization.md` (rev 2.4),
 * `docs/designs/rsk-v2-tokenization.md` (rev 2.1).
 *
 * RULE (`apps/web-app/AGENTS.md`): Hijra templates are LITERAL source of truth.
 * Every token MUST correspond to an actual fillable slot in the Hijra template.
 * If RSK references a field MUAP doesn't have, the token is `rsk_*` (RSK-owned),
 * NOT a "promotion" to MUAP. The registry's integrity assertion enforces this.
 */

/** Which Hijra template(s) this token appears in. */
export type TemplateId = 'muap' | 'rsk'

/**
 * Token kind — drives fill-engine routing.
 *
 * - `fact-display`: typed by app/OCR/analyst, written verbatim to doc.
 * - `fact-calc`: derived from other tokens (`formula`); recomputes on `triggersRecompute`.
 * - `categorical`: enum-bounded value (binary `_or_X` suffix or 3+ named values).
 * - `narrative-ai`: AI-authored prose, masked-in / unmasked-out, never authoritative.
 */
export type TokenKind = 'fact-display' | 'fact-calc' | 'categorical' | 'narrative-ai'

/**
 * Where the value comes from at fill time.
 *
 * - `app`: typed by analyst via Mizan form (app-authoritative)
 * - `ocr`: extracted from uploaded document (OCR provider)
 * - `analyst`: typed by analyst directly into Google Doc post-init
 * - `ai-narrative`: Gemini generation, mask-in/unmask-out
 * - `ai-with-research-context`: Gemini generation with deep-research context appended
 * - `policy`: read from active policy version (e.g. `RiskPolicyVersion`)
 * - `derived`: computed at fill time from other tokens or registries
 */
export type TokenSource =
  | 'app'
  | 'ocr'
  | 'analyst'
  | 'ai-narrative'
  | 'ai-with-research-context'
  | 'policy'
  | 'derived'

/** Domains that must recompute when this token's value changes. */
export type RecomputeTrigger = 'dsr' | 'ltv' | 'sla' | 'scoring' | 'hardgate'

export interface TemplateToken {
  /** Snake_case slug. Unique across both templates combined. Must match NamedRange name in Doc. */
  name: string
  /** Which Hijra template(s) include this token. Either or both. */
  templates: ReadonlyArray<TemplateId>
  kind: TokenKind
  source: TokenSource
  /** Short human-facing description. Goes into setup-template-ranges + docs. */
  description: string
  /** For `kind: 'categorical'`. Allowed values in template-rendering form (Bahasa if template is Bahasa). */
  enum?: ReadonlyArray<string>
  /** For `kind: 'fact-calc'`. Plain-language formula reference; implementation lives in fill engine. */
  formula?: string
  /** Domains to recompute when this token's value changes. */
  triggersRecompute?: ReadonlyArray<RecomputeTrigger>
  /** Reference: template anchor (e.g. "MUAP T6 r2", "RSK §II.1") for human navigability. */
  anchor?: string
}

/**
 * Thrown when registry integrity assertions fail (e.g. duplicate name,
 * categorical without enum, RSK token claiming MUAP reuse where MUAP lacks it).
 */
export class TokenRegistryError extends Error {
  override name = 'TokenRegistryError' as const
}
