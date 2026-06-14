// NOTE: deliberately NOT 'server-only' — this module (via the reference-text.ts router) is also used
// by tsx CLI scripts (apps/web-app/scripts/sync-reference-texts.ts). It's a thin prisma wrapper;
// calling it from client code would error at the prisma import, which is the real guard. Routed behind
// reference-text.ts by DATA_BACKEND; the Firestore twin is reference-text.firestore.ts.
import { prisma } from '@/server/db'
import type { TemplateId } from '@/lib/templates/tokens'

/**
 * Reference-text reader for the v2 template engine (Prisma impl).
 *
 * When the fill engine's resolver chain returns null for a token, the engine writes
 * the reference text from the DB cache (the bracketed Hijra guidance string) into the
 * NamedRange so the analyst sees the original prompt instead of an empty cell.
 *
 * Cache is regenerable by `scripts/sync-reference-texts.ts` from the References Doc.
 * Schema rationale lives in `prisma/schema.prisma` model TemplateReferenceText.
 */

export interface UpsertReferenceTextInput {
  templateId: TemplateId
  tokenName: string
  text: string
  sourceDocRevisionId?: string | null
}

/** Get the reference text for a token in a template, or null if not cached. */
export async function getReferenceText(
  templateId: TemplateId,
  tokenName: string,
): Promise<string | null> {
  const row = await prisma.templateReferenceText.findUnique({
    where: { templateId_tokenName: { templateId, tokenName } },
    select: { text: true },
  })
  return row?.text ?? null
}

/** Bulk fetch — handy for the fill engine to prefetch every token in one query. */
export async function getReferenceTextsBulk(
  templateId: TemplateId,
  tokenNames: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, string>> {
  const rows = await prisma.templateReferenceText.findMany({
    where: { templateId, tokenName: { in: [...tokenNames] } },
    select: { tokenName: true, text: true },
  })
  return new Map(rows.map((r) => [r.tokenName, r.text]))
}

/**
 * Upsert one reference text. Used by the sync script — not by the fill engine.
 * Token validation happens in the router (reference-text.ts) so both backends share it.
 * `sourceDocRevisionId` lets the next sync detect upstream Doc changes.
 */
export async function upsertReferenceText(input: UpsertReferenceTextInput): Promise<void> {
  await prisma.templateReferenceText.upsert({
    where: { templateId_tokenName: { templateId: input.templateId, tokenName: input.tokenName } },
    update: {
      text: input.text,
      sourceDocRevisionId: input.sourceDocRevisionId ?? null,
      syncedAt: new Date(),
    },
    create: {
      templateId: input.templateId,
      tokenName: input.tokenName,
      text: input.text,
      sourceDocRevisionId: input.sourceDocRevisionId ?? null,
    },
  })
}

/** Count cached entries — used by the sync script for a smoke-check after run. */
export async function countReferenceTexts(templateId: TemplateId): Promise<number> {
  return prisma.templateReferenceText.count({ where: { templateId } })
}
