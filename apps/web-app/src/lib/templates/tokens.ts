/**
 * MUAP/RSK v2 unified token registry.
 *
 * Single source of truth for "what tokens exist + which template(s) + kind + source".
 * Module-load assertions guarantee:
 *   1. No duplicate names.
 *   2. Every categorical has a non-empty enum.
 *   3. Every fact-calc has a formula description.
 *   4. Every narrative-ai token has `ai_*` or `ai_rsk_*` prefix.
 *   5. Every `rsk_*` token includes 'rsk' in templates.
 *   6. Every token with `triggersRecompute` is `fact-calc`.
 *
 * The assertion runs at first import (`buildRegistry()`); test suite re-runs it
 * standalone to catch regressions. NO silent failures: bad registry = boot fails.
 *
 * Per `apps/web-app/AGENTS.md`: never invent cross-template "promotions". If RSK
 * needs a field MUAP lacks, define it as `rsk_*` here with `templates: ['rsk']`.
 */
import type { TemplateToken, TemplateId } from './types'
import { TokenRegistryError } from './types'
import { MUAP_ONLY_TOKENS } from './muap-tokens'
import { RSK_ONLY_TOKENS } from './rsk-tokens'
import { SHARED_TOKENS } from './shared-tokens'

/** Forbidden token names — sentinels that would clash with gating logic. */
const FORBIDDEN_NAMES = new Set<string>([
  '_level',
  'recommend',
  'recommendation',
  'risk_level',
  'final_decision',
])

function assertNoDuplicates(tokens: ReadonlyArray<TemplateToken>): void {
  const seen = new Set<string>()
  for (const t of tokens) {
    if (seen.has(t.name)) {
      throw new TokenRegistryError(`Duplicate token name: ${t.name}`)
    }
    seen.add(t.name)
  }
}

function assertNoForbidden(tokens: ReadonlyArray<TemplateToken>): void {
  for (const t of tokens) {
    if (FORBIDDEN_NAMES.has(t.name)) {
      throw new TokenRegistryError(`Forbidden token name (clashes with gating logic): ${t.name}`)
    }
  }
}

function assertWellFormed(t: TemplateToken): void {
  if (t.templates.length === 0) {
    throw new TokenRegistryError(`${t.name}: must include at least one template`)
  }
  if (t.kind === 'categorical' && (!t.enum || t.enum.length === 0)) {
    throw new TokenRegistryError(`${t.name}: categorical kind requires non-empty enum`)
  }
  if (t.kind === 'fact-calc' && !t.formula) {
    throw new TokenRegistryError(`${t.name}: fact-calc kind requires formula description`)
  }
  if (t.kind === 'narrative-ai' && !(t.name.startsWith('ai_') || t.name.startsWith('ai_rsk_'))) {
    throw new TokenRegistryError(`${t.name}: narrative-ai kind requires ai_* or ai_rsk_* prefix`)
  }
  if (t.name.startsWith('rsk_') && !t.templates.includes('rsk')) {
    throw new TokenRegistryError(`${t.name}: rsk_* prefix requires 'rsk' in templates`)
  }
  if (t.name.startsWith('ai_rsk_') && !t.templates.includes('rsk')) {
    throw new TokenRegistryError(`${t.name}: ai_rsk_* prefix requires 'rsk' in templates`)
  }
  if (t.triggersRecompute && t.kind !== 'fact-calc') {
    throw new TokenRegistryError(`${t.name}: triggersRecompute requires fact-calc kind`)
  }
}

/**
 * Cross-template integrity: RSK reads (R1 tier — un-prefixed tokens in RSK_ONLY_TOKENS or SHARED)
 * must resolve to an actual MUAP-owning token. This is the build-time fail-loud rule from AGENTS.md:
 *
 *   "If RSK references a field MUAP doesn't have, RSK owns the field (rsk_* token)
 *    — do NOT 'promote' the concept to MUAP."
 *
 * Mechanically: any token in RSK_ONLY_TOKENS that lacks `rsk_` or `ai_rsk_` prefix is forbidden
 * (it would be claiming MUAP-reuse-from-RSK without being in MUAP). Shared tokens encode the
 * legitimate reuse — they live in SHARED_TOKENS with `templates: ['muap', 'rsk']`.
 */
function assertNoInventedReuse(rskOnly: ReadonlyArray<TemplateToken>): void {
  for (const t of rskOnly) {
    if (!t.name.startsWith('rsk_') && !t.name.startsWith('ai_rsk_')) {
      throw new TokenRegistryError(
        `${t.name}: RSK-only token without rsk_/ai_rsk_ prefix — ` +
          `if this is a MUAP reuse, move it to SHARED_TOKENS with templates: ['muap', 'rsk']. ` +
          `If MUAP template lacks this field, prefix the token rsk_*. ` +
          `(See AGENTS.md: never invent cross-template promotions.)`,
      )
    }
  }
}

function buildRegistry(): ReadonlyArray<TemplateToken> {
  const all = [...MUAP_ONLY_TOKENS, ...RSK_ONLY_TOKENS, ...SHARED_TOKENS]
  for (const t of all) assertWellFormed(t)
  assertNoDuplicates(all)
  assertNoForbidden(all)
  assertNoInventedReuse(RSK_ONLY_TOKENS)
  return Object.freeze(all)
}

/** All tokens across both templates, validated at module load. */
export const TOKENS: ReadonlyArray<TemplateToken> = buildRegistry()

/** Index for O(1) lookup by name. */
const BY_NAME: ReadonlyMap<string, TemplateToken> = new Map(TOKENS.map((t) => [t.name, t]))

/** Lookup a token by name. Throws if unknown. */
export function getToken(name: string): TemplateToken {
  const t = BY_NAME.get(name)
  if (!t) throw new TokenRegistryError(`Unknown token: ${name}`)
  return t
}

/** Optional lookup (returns undefined if unknown). */
export function findToken(name: string): TemplateToken | undefined {
  return BY_NAME.get(name)
}

/** All tokens that appear in a given template. */
export function tokensFor(template: TemplateId): ReadonlyArray<TemplateToken> {
  return TOKENS.filter((t) => t.templates.includes(template))
}

/** All names that appear in a given template (handy for NamedRange-setup scripts). */
export function tokenNamesFor(template: TemplateId): ReadonlyArray<string> {
  return tokensFor(template).map((t) => t.name)
}

/** Re-export for downstream code that doesn't need the index. */
export type { TemplateToken, TemplateId, TokenKind, TokenSource, RecomputeTrigger } from './types'
export { TokenRegistryError } from './types'
