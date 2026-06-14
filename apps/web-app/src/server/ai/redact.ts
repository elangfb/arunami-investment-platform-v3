// The redaction seam for AI text egress — ONE place every text-inference call masks PII
// and runs the fail-closed residual backstop, so the policy is identical across the chat
// assistant (assistant.ts) and the MUAP/RSK narrative drafter (narrative.ts), and any future
// AI surface. This centralises the *mechanism*; the *policy on a residual hit* stays at the
// caller (chat THROWS, narrative falls back to {}), because that divergence is intentional.
//
// PLUGGABLE REDACTOR (the NER drop-in seam): today the only redactor is `regexRedactor`
// (known-fields + regex, exactly the ratified masking — NO NER, see lib/pii-mask.ts header).
// When a Bahasa NER redactor is built (deferred — see docs/references/ai-ml-deferred.md §A), it
// implements `Redactor` and is composed via `redactorPipeline([regexRedactor, nerRedactor])`
// inside `activeRedactor()` below — a one-line change here, NO call-site edits. Do not claim
// NER exists until that lands.
//
// Pure module (no prisma / no server-only) so the narrative path stays hermetically testable.

import { maskPii, detectResidualPii, type PiiSecret } from '@/lib/pii-mask'

/** A redaction strategy: mask known/again-detectable PII, and report what survived. */
export interface Redactor {
  /** Stable id for audit/logging (never PII). */
  readonly name: string
  /** Replace PII in `text` with placeholders. */
  mask(text: string, secrets: PiiSecret[]): string
  /** Placeholder LABELS of high-confidence PII still present in already-masked text (safe to log). */
  detectResidual(maskedText: string, secrets: PiiSecret[]): string[]
}

/** The ratified known-fields + regex redactor (lib/pii-mask). The only redactor today. */
export const regexRedactor: Redactor = {
  name: 'regex',
  mask: maskPii,
  detectResidual: detectResidualPii,
}

/**
 * Compose redactors into one: mask is applied left→right (each sees the prior's output);
 * residual is the UNION of every stage's detections (fail-closed — any stage flagging blocks).
 * This is how NER will layer on top of the regex pass without touching call sites.
 */
export function redactorPipeline(redactors: Redactor[]): Redactor {
  return {
    name: redactors.map((r) => r.name).join('+'),
    mask: (text, secrets) => redactors.reduce((t, r) => r.mask(t, secrets), text),
    detectResidual: (text, secrets) => [...new Set(redactors.flatMap((r) => r.detectResidual(text, secrets)))],
  }
}

/**
 * The active redactor for all AI text egress. SINGLE SWAP POINT: to add NER later, return
 * `redactorPipeline([regexRedactor, nerRedactor])` here — nothing else changes.
 */
export function activeRedactor(): Redactor {
  return regexRedactor
}

/**
 * Masking ON/OFF switch (Fork B4, RM-led redesign — PII/compliance PARKED). Default OFF in dev:
 * masking is a config-gated NO-OP so the happy path runs against raw context while compliance is
 * parked, and re-enables wholesale at OJK W1 ratification by setting `PII_MASK_ENABLED=1`. Mirrors
 * the `blockOnResidualPii()`/`PII_RESIDUAL_BLOCK` env-flag pattern (=== '1', default off). The seam
 * (`maskForEgress`) stays the SINGLE policy point — the 6 AI call sites are untouched either way.
 * ⚠️ Do NOT set this on in dev/tests: see CLAUDE.md "Build posture" (masking re-enables at W1).
 */
export function maskingEnabled(): boolean {
  return process.env.PII_MASK_ENABLED === '1'
}

/**
 * Mask `text` with the active redactor and report residual PII in one call.
 *
 * When masking is DISABLED (`maskingEnabled()` false — the parked-compliance default) this is a
 * PASS-THROUGH: the raw text is returned with no residual, and the redactor never runs (so context
 * injected here egresses raw while masking is parked). When ENABLED it masks exactly as before. This
 * is the ONE gate for the whole AI-egress masking policy — keep it here, not at the call sites.
 */
export function maskForEgress(text: string, secrets: PiiSecret[]): { masked: string; residual: string[] } {
  if (!maskingEnabled()) return { masked: text, residual: [] }
  const r = activeRedactor()
  const masked = r.mask(text, secrets)
  return { masked, residual: r.detectResidual(masked, secrets) }
}

/**
 * Egress POLICY on a residual-PII hit: BLOCK (fail-closed) or LOG-AND-ALLOW (fail-open)?
 *
 * Default is fail-OPEN — masking still runs and the residual is ALWAYS logged
 * (`pii.residual_detected`), but the (already-masked) text is allowed to egress so an
 * imperfect mask never breaks a feature while Mizan is being demoed/presented. The masking
 * itself is unchanged; only this backstop's *reaction* is softened.
 *
 * ⚠️ COMPLIANCE: before processing REAL customer data in production (G2/G5, OJK + UU PDP),
 * set `PII_RESIDUAL_BLOCK=1` to restore the fail-closed posture. Re-tightening is config-only —
 * detection + masking machinery stays in place either way.
 */
export function blockOnResidualPii(): boolean {
  return process.env.PII_RESIDUAL_BLOCK === '1'
}
