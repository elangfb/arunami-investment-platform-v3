'use server'

import { requireActor } from '@/server/auth/session'
import { assertDesk, auditUserName } from '@/lib/auth/can'
import { appendConversationMessages, loadApplicationForWrite } from '@/server/repo/write'
import { getApplicationDocs } from '@/server/docs/service'
import { answerAndAudit } from '@/server/ai/assistant'
import { buildAiContext } from '@/lib/ai-api'
import { buildPrompt, systemInstruction } from '@/server/ai/context'
import { appendCascade } from '@/server/ai/context-inject'
import type { LoanApplication } from '@/lib/types'

// Dedicated AI risk-assistant (AIChatTab). Compliance-complete:
//  • gated to the analysis/risk desks (muap-author / rsk-author),
//  • the prompt is PII-masked + the turn is audited (answerAndAudit → AiInteraction),
//  • the thread lives in ConversationMessage (surface='assistant'), SEPARATE from the team
//    discussion (surface='discussion'); the rolling 10-turn window is applied at READ time
//    (serialize.ts ASSISTANT_WINDOW), so writes just append the two messages of this turn.
export async function askAiAssistantAction(appId: string, prompt: string): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'muap-author', 'rsk-author')
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  const question = prompt.trim()
  if (!question) throw new Error('Pertanyaan tidak boleh kosong')

  const { snapshot } = await getApplicationDocs(appId)
  // Inject the layered AI context (design §5) at the END of the user prompt, per the 'assistant'
  // surface policy (all 3 layers). answerAndAudit masks the result before egress.
  const rawPrompt = await appendCascade(buildPrompt(buildAiContext(app), snapshot, question), app, 'assistant')
  const reply = await answerAndAudit({
    appId,
    userId: actor.userId,
    surface: 'assistant',
    systemInstruction: await systemInstruction(),
    rawPrompt,
    pii: app,
  })

  // Append both messages of the turn as ConversationMessage rows (no history entry — the
  // compliance audit for the assistant is AiInteraction, written by answerAndAudit above).
  return appendConversationMessages({
    appId,
    expectedVersion: app.version ?? 0,
    surface: 'assistant',
    messages: [
      { role: 'user', content: question, authorId: actor.userId, authorName: auditUserName(actor) },
      { role: 'assistant', content: reply, authorName: 'MIZAN AI' },
    ],
  })
}
