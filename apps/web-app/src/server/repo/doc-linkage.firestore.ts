import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import type { DocumentSnapshot, Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import { NotFoundError } from './errors'
import type { DocLinkageRow, UpsertDocLinkageInput, DocLinkagePatch } from './doc-linkage.prisma'

// Firestore impl of DocLinkage — parity with doc-linkage.prisma.ts. docLinkages/{applicationId} (1:1).
// upsert is a tx (read → update mutable partial, or set full create with null defaults); update throws
// NotFoundError on a missing row (parity with Prisma's update P2025); createdAt is set once, updatedAt
// bumped on every write.

const col = () => getDb().collection(COL.docLinkages)

function snapToRow(s: DocumentSnapshot): DocLinkageRow {
  const d = s.data() as Record<string, unknown>
  return {
    applicationId: s.id,
    muapDocId: (d.muapDocId as string | null | undefined) ?? null,
    rskDocId: (d.rskDocId as string | null | undefined) ?? null,
    momDocId: (d.momDocId as string | null | undefined) ?? null,
    sp3DocId: (d.sp3DocId as string | null | undefined) ?? null,
    shortcutWarning: (d.shortcutWarning as string | null | undefined) ?? null,
    templateVersion: (d.templateVersion as string | undefined) ?? 'v1',
    createdAt: toDate(d.createdAt as Timestamp | undefined) ?? new Date(0),
    updatedAt: toDate(d.updatedAt as Timestamp | undefined) ?? new Date(0),
  }
}

export async function getDocLinkage(applicationId: string): Promise<DocLinkageRow | null> {
  const snap = await col().doc(applicationId).get()
  return snap.exists ? snapToRow(snap) : null
}

export async function getDocLinkageOrThrow(applicationId: string): Promise<DocLinkageRow> {
  const snap = await col().doc(applicationId).get()
  if (!snap.exists) throw new NotFoundError(`DocLinkage ${applicationId}`)
  return snapToRow(snap)
}

export async function upsertDocLinkage(input: UpsertDocLinkageInput): Promise<DocLinkageRow> {
  const db = getDb()
  const ref = col().doc(input.applicationId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists) {
      tx.update(ref, { ...input.update, updatedAt: FieldValue.serverTimestamp() })
    } else {
      tx.set(ref, {
        muapDocId: input.create.muapDocId,
        rskDocId: input.create.rskDocId,
        momDocId: null,
        sp3DocId: null,
        shortcutWarning: null,
        templateVersion: input.create.templateVersion,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  })
  return snapToRow(await ref.get())
}

export async function updateDocLinkage(applicationId: string, data: DocLinkagePatch): Promise<DocLinkageRow> {
  const ref = col().doc(applicationId)
  // .update() throws NOT_FOUND on a missing row — same as Prisma's update (P2025).
  await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() })
  return snapToRow(await ref.get())
}
