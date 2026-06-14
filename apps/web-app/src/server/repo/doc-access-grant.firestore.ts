import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { docAccessGrantId } from './doc-ids'
import type { DocAccessGrantRow, UpsertDocGrantInput, WriterGrant } from './doc-access-grant.prisma'

// Firestore impl of DocAccessGrant persistence — parity with doc-access-grant.prisma.ts. docId =
// docAccessGrantId(docId, email) (= the @@unique([docId, email]) composite), so the pair is the doc
// identity and upsert is a deterministic write. grantedAt is preserved across updates (set only on
// first create, in a tx) to keep the audit's original-grant time; updatedAt is bumped each write.
// listWriterGrantsForDoc uses two equality filters (docId, role) — served without a composite index.

const col = () => getDb().collection(COL.docAccessGrant)

export async function getDocAccessGrant(docId: string, email: string): Promise<DocAccessGrantRow | null> {
  const snap = await col().doc(docAccessGrantId(docId, email)).get()
  if (!snap.exists) return null
  const d = snap.data() as Record<string, unknown>
  return { role: d.role as string, permissionId: (d.permissionId as string | null | undefined) ?? null }
}

export async function upsertDocAccessGrant(input: UpsertDocGrantInput): Promise<void> {
  const db = getDb()
  const ref = col().doc(docAccessGrantId(input.docId, input.email))
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const mutable = {
      applicationId: input.applicationId,
      docId: input.docId,
      email: input.email,
      role: input.role,
      permissionId: input.permissionId,
      grantedToUserId: input.grantedToUserId,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (snap.exists) tx.update(ref, mutable)
    else tx.set(ref, { ...mutable, grantedAt: FieldValue.serverTimestamp() })
  })
}

export async function listWriterGrantsForDoc(docId: string): Promise<WriterGrant[]> {
  const snap = await col().where('docId', '==', docId).where('role', '==', 'writer').get()
  return snap.docs.map((s) => {
    const d = s.data()
    return {
      email: d.email as string,
      permissionId: (d.permissionId as string | null | undefined) ?? null,
      grantedToUserId: d.grantedToUserId as string,
    }
  })
}

export async function downgradeDocGrantToReader(docId: string, email: string): Promise<void> {
  // .update() throws NOT_FOUND on a missing doc — same as Prisma's update (P2025); the caller
  // (reconcileFrozenDocGrants) only ever passes rows it just listed, and wraps each in try/catch.
  await col().doc(docAccessGrantId(docId, email)).update({ role: 'reader', updatedAt: FieldValue.serverTimestamp() })
}
