import 'server-only'

import { dispatchWrite } from '@/server/repo/dispatch'
import * as prismaImpl from './audit.prisma'
import * as firestoreImpl from './audit.firestore'

// AI-interaction audit writer — dispatcher. Routes to the Prisma or Firestore impl by DATA_BACKEND
// (dual = Prisma authoritative + Firestore shadow). Callers keep importing '@/server/ai/audit'.
// recordAiInteraction is invoked best-effort at call sites (audit-best-effort.ts): a failed write is
// logged but never discards the AI output (fail-open, 2026.06.08 decision).

export type { AiSurface, AiInteractionEntry } from './audit.prisma'

export const recordAiInteraction = dispatchWrite(
  'recordAiInteraction',
  prismaImpl.recordAiInteraction,
  firestoreImpl.recordAiInteraction,
)
