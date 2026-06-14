import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { templateReferenceTextId } from '@/server/repo/doc-ids'
import type { TemplateId } from '@/lib/templates/tokens'
import type { UpsertReferenceTextInput } from './reference-text.prisma'

// Firestore impl of the v2 reference-text cache — parity with reference-text.prisma.ts. docId =
// templateReferenceTextId(templateId, tokenName) (the Prisma @@id composite), so upsert = set() and
// the per-token reads are direct doc gets. Static cache (V2, dormant — V3 superseded it); kept for
// parity. countReferenceTexts uses a count() aggregation over the single-field templateId index.

const col = () => getDb().collection(COL.config_templateReferenceText)

export async function getReferenceText(templateId: TemplateId, tokenName: string): Promise<string | null> {
  const snap = await col().doc(templateReferenceTextId(templateId, tokenName)).get()
  return snap.exists ? (((snap.data() as Record<string, unknown>).text as string | undefined) ?? null) : null
}

export async function getReferenceTextsBulk(
  templateId: TemplateId,
  tokenNames: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, string>> {
  const out = new Map<string, string>()
  if (tokenNames.length === 0) return out
  const db = getDb()
  const refs = tokenNames.map((n) => col().doc(templateReferenceTextId(templateId, n)))
  const snaps = await db.getAll(...refs)
  for (const s of snaps) {
    if (!s.exists) continue
    const d = s.data() as Record<string, unknown>
    out.set(d.tokenName as string, d.text as string)
  }
  return out
}

export async function upsertReferenceText(input: UpsertReferenceTextInput): Promise<void> {
  await col().doc(templateReferenceTextId(input.templateId, input.tokenName)).set({
    templateId: input.templateId,
    tokenName: input.tokenName,
    text: input.text,
    sourceDocRevisionId: input.sourceDocRevisionId ?? null,
    syncedAt: FieldValue.serverTimestamp(),
  })
}

export async function countReferenceTexts(templateId: TemplateId): Promise<number> {
  const agg = await col().where('templateId', '==', templateId).count().get()
  return agg.data().count
}
