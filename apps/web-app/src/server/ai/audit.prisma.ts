import 'server-only'

import { prisma } from '@/server/db'

// The single writer for the AI-interaction audit trail (G3) — Prisma impl, routed behind the
// dispatcher (audit.ts) by DATA_BACKEND; the Firestore twin is audit.firestore.ts. Every audited AI
// text egress records the MASKED prompt + MASKED reply (never raw PII), the acting user, the
// application, the surface, and the model id. Callers must mask both sides BEFORE calling this — the
// audit store must never hold un-masked PII (so audit happens AFTER the caller's output masking).

export type AiSurface = 'discussion' | 'assistant' | 'advisory' | 'research' | 'narrative' | 'bureau' | 'extract'

export interface AiInteractionEntry {
  appId: string
  userId: string
  surface: AiSurface
  /** Already PII-masked prompt. */
  maskedPrompt: string
  /** Already PII-masked reply. */
  maskedReply: string
  model: string
}

export async function recordAiInteraction(entry: AiInteractionEntry): Promise<void> {
  await prisma.aiInteraction.create({
    data: {
      applicationId: entry.appId,
      userId: entry.userId,
      surface: entry.surface,
      maskedPrompt: entry.maskedPrompt,
      maskedReply: entry.maskedReply,
      model: entry.model,
    },
  })
}
