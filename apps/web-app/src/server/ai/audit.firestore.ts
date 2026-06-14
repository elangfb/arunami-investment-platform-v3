import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import type { AiInteractionEntry } from './audit.prisma'

// Firestore impl of the AI-interaction audit writer — parity with audit.prisma.ts. Append-only:
// each masked egress is an auto-id doc in the aiInteraction collection (never updated/deleted). The
// (applicationId, createdAt desc) + (userId, createdAt desc) composite indexes back the audit reads.

export async function recordAiInteraction(entry: AiInteractionEntry): Promise<void> {
  await getDb().collection(COL.aiInteraction).add({
    applicationId: entry.appId,
    userId: entry.userId,
    surface: entry.surface,
    maskedPrompt: entry.maskedPrompt,
    maskedReply: entry.maskedReply,
    model: entry.model,
    createdAt: FieldValue.serverTimestamp(),
  })
}
