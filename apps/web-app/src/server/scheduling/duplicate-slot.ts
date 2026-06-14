import 'server-only'

import { DuplicateMeetingSlotError } from '@/server/repo/errors'

// Backend-agnostic "this (template, scheduledDate) slot is already materialized" detector — the
// materializer's idempotency hinges on it. Two backends raise it two ways:
//   • Firestore — createMeeting throws DuplicateMeetingSlotError (index_meetingTemplateSlot collision)
//   • Prisma    — the @@unique([sourceTemplateId, scheduledDate]) violation surfaces as a
//                 PrismaClientKnownRequestError with code 'P2002'
// The Prisma case is DUCK-TYPED (e.code === 'P2002') rather than `instanceof` so this module — and
// thus materialize.ts — never statically imports @prisma/client, keeping the Firestore path free of
// the Prisma graph. createMeeting's only relevant unique constraint is the slot, so any P2002 from it
// is the slot (same assumption the original inline catch made).
export function isDuplicateSlotError(e: unknown): boolean {
  if (e instanceof DuplicateMeetingSlotError) return true
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}
