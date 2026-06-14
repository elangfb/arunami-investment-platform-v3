import 'server-only'

import { inferenceProvider } from '@/server/ai/provider'
import { maskForEgress, blockOnResidualPii } from '@/server/ai/redact'
import { recordAiInteraction } from '@/server/ai/audit'
import { auditBestEffort } from '@/server/ai/audit-best-effort'
import { piiSecrets } from '@/lib/pii-mask'
import { log } from '@/server/log'
import type { LoanApplication } from '@/lib/types'

// The single compliant boundary for application-grounded AI calls (OJK + Bank §1.1):
//   1. PII MASKING — the prompt is masked BEFORE it leaves Hijra infra (the Gemini call).
//   2. AUDIT — the masked prompt + masked reply are written to AiInteraction with the
//      acting userId, application id, surface, model, and timestamp.
// The reply is masked again defensively (idempotent) before returning. Callers (the /ai
// route for the team discussion, askAiAssistantAction for the risk-assistant) gate the
// actor first; the rolling-turn-window bound is applied by the assistant caller.

type PiiApp = Pick<LoanApplication, 'nasabahName' | 'nik' | 'phoneNumber' | 'whatsappNumber' | 'namaUsaha'>

export async function answerAndAudit(opts: {
  appId: string
  userId: string
  surface: 'discussion' | 'assistant'
  systemInstruction: string
  /** The fully composed prompt (pre-mask). */
  rawPrompt: string
  /** The application, for deriving the PII secrets to redact. */
  pii: PiiApp
}): Promise<string> {
  const secrets = piiSecrets(opts.pii)
  // Mask-in via the shared redaction seam (NER-ready). Fail-open by default: log any residual
  // but still egress (set PII_RESIDUAL_BLOCK=1 to restore fail-closed for prod — see redact.ts).
  const { masked: maskedPrompt, residual: promptResidual } = maskForEgress(opts.rawPrompt, secrets)
  if (promptResidual.length) {
    const block = blockOnResidualPii()
    log.warn('pii.residual_detected', { surface: opts.surface, appId: opts.appId, phase: 'prompt', types: promptResidual, blocked: block })
    if (block) throw new Error('AI request blocked: residual PII detected in prompt.')
  }
  const ai = inferenceProvider()
  const reply = await ai.generateReply(opts.systemInstruction, maskedPrompt)
  // Re-mask the reply (same seam). If the model echoed a structured identifier the mask missed,
  // log it; the returned/stored value is the MASKED reply either way. Block only when configured.
  const { masked: maskedReply, residual: replyResidual } = maskForEgress(reply, secrets)
  if (replyResidual.length) {
    const block = blockOnResidualPii()
    log.warn('pii.residual_detected', { surface: opts.surface, appId: opts.appId, phase: 'reply', types: replyResidual, blocked: block })
    if (block) throw new Error('AI reply blocked: residual PII detected in response.')
  }
  // Audit AFTER output masking — the store holds only masked text (G3). Best-effort: a failed
  // audit write logs but never discards the already-generated reply (AI audit = fail-open,
  // decided 2026.06.08; mirrors bureau/narrative/research).
  await auditBestEffort(
    () =>
      recordAiInteraction({
        appId: opts.appId,
        userId: opts.userId,
        surface: opts.surface,
        maskedPrompt,
        maskedReply,
        model: ai.model(),
      }),
    'assistant.audit_failed',
    { surface: opts.surface, appId: opts.appId },
  )
  return maskedReply
}
