// NOTE: deliberately NOT 'server-only' — imported by the sync-reference-texts CLI under plain tsx
// (apps/web-app/scripts/sync-reference-texts.ts). Routes by DATA_BACKEND between the Prisma and
// Firestore impls. The Firestore impl pulls in the server-only firebase graph, so it is LAZY-imported
// ONLY when DATA_BACKEND=firestore — the prisma-mode CLI never loads firebase (mirrors storage/s3.ts).
// `dual` is not meaningful here (greenfield cutover, P4 skipped) → binary prisma|firestore route.
import { findToken, type TemplateId } from '@/lib/templates/tokens'
import * as prismaImpl from './reference-text.prisma'
import type * as FsMod from './reference-text.firestore'
import type { UpsertReferenceTextInput } from './reference-text.prisma'

export type { UpsertReferenceTextInput } from './reference-text.prisma'

function firestoreSelected(): boolean {
  return process.env.DATA_BACKEND === 'firestore'
}
function fs(): Promise<typeof FsMod> {
  return import('./reference-text.firestore')
}

/** Get the reference text for a token in a template, or null if not cached. */
export async function getReferenceText(templateId: TemplateId, tokenName: string): Promise<string | null> {
  return firestoreSelected()
    ? (await fs()).getReferenceText(templateId, tokenName)
    : prismaImpl.getReferenceText(templateId, tokenName)
}

/** Bulk fetch — handy for the fill engine to prefetch every token in one query. */
export async function getReferenceTextsBulk(
  templateId: TemplateId,
  tokenNames: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, string>> {
  return firestoreSelected()
    ? (await fs()).getReferenceTextsBulk(templateId, tokenNames)
    : prismaImpl.getReferenceTextsBulk(templateId, tokenNames)
}

/** Upsert one reference text. Validates the token name against the registry (shared by both backends). */
export async function upsertReferenceText(input: UpsertReferenceTextInput): Promise<void> {
  if (!findToken(input.tokenName)) {
    throw new Error(`upsertReferenceText: unknown token ${input.tokenName}`)
  }
  return firestoreSelected() ? (await fs()).upsertReferenceText(input) : prismaImpl.upsertReferenceText(input)
}

/** Count cached entries — used by the sync script for a smoke-check after run. */
export async function countReferenceTexts(templateId: TemplateId): Promise<number> {
  return firestoreSelected() ? (await fs()).countReferenceTexts(templateId) : prismaImpl.countReferenceTexts(templateId)
}
