'use server'

import { requireActor } from '@/server/auth/session'
import { assertDesk } from '@/lib/auth/can'
import { parseRiskPolicy } from '@/lib/config/risk-policy-input'
import { createRiskPolicyVersion } from '@/server/config/risk-policy'
import { appendAiPromptVersion, isAiPromptKey } from '@/server/config/ai-prompts'
import type { AiPromptKey } from '@/lib/ai-prompts'

// Policy (risk) admin write actions. Gated on the ADMIN-POLICY desk (superadmin passes). Append-only +
// audited: each save writes a NEW version row (who/when/why). The DB write is backend-routed through
// the server/config writers; this layer keeps the actor gate + validate-before-persist.

export async function createRiskPolicyVersionAction(
  input: { dsrMaxPct: number; ltvMaxPct: number; kolMax: number },
  reason?: string,
): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-POLICY')
  const policy = parseRiskPolicy(input) // validate before it can become a version
  await createRiskPolicyVersion(policy, reason?.trim() || null, actor.userId)
}

// ── AI system prompt admin (configurability-and-admin) ───────────────────────────────────────────
// Each AI surface's system prompt is admin-editable, versioned (AiPromptVersion), append-only.
// Gated on ADMIN-POLICY. Compliance: the prompt is GUIDANCE; the HARD safety guards live in code.
export async function setAiPromptAction(
  promptKey: string,
  systemInstruction: string,
  reason?: string,
): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-POLICY')

  if (!isAiPromptKey(promptKey)) throw new Error(`Unknown AI prompt key: ${promptKey}`)
  const text = systemInstruction.trim()
  if (text.length < 20) throw new Error('System prompt minimal 20 karakter.')
  if (text.length > 8000) throw new Error('System prompt maksimal 8000 karakter.')

  await appendAiPromptVersion({
    promptKey: promptKey as AiPromptKey,
    systemInstruction: text,
    effectiveFrom: new Date(),
    reason: reason?.trim() || null,
    createdBy: actor.userId,
  })
}
