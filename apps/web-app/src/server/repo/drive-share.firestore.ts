import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { isAlreadyExists } from './errors'
import { driveRootGrantId } from './doc-ids'
import type { DriveRootGrantRow, UpsertRootGrantInput } from './drive-share.prisma'

// Firestore impl of DriveRef + DriveRootGrant persistence — parity with drive-share.prisma.ts.
// DriveRef: driveRefs/{key} (key 'mizan-root'); first-writer-wins via create()+ignore-already-exists.
// DriveRootGrant: driveRootGrants/{slug(email)} — the email IS the identity (Prisma @unique(email)),
// so the doc-id is driveRootGrantId(email). The returned `id` is that docId (the opaque handle
// callers pass back to update/delete). grantedAt is preserved across updates (set only on create, in
// a tx); countReaderGrants/listReaderGrants use the single-field role index.

function snapToRow(s: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): DriveRootGrantRow {
  const d = s.data() as Record<string, unknown>
  return {
    id: s.id,
    userId: d.userId as string,
    email: d.email as string,
    role: d.role as string,
    permissionId: (d.permissionId as string | null | undefined) ?? null,
  }
}

// ── DriveRef ───────────────────────────────────────────────────────────────────

export async function getDriveRef(key: string): Promise<{ folderId: string } | null> {
  const snap = await getDb().collection(COL.driveRefs).doc(key).get()
  return snap.exists ? { folderId: (snap.data() as Record<string, unknown>).folderId as string } : null
}

export async function upsertDriveRef(key: string, folderId: string): Promise<void> {
  try {
    // create() (not set()) = first-writer-wins: an established ref is never repointed.
    await getDb().collection(COL.driveRefs).doc(key).create({ key, folderId, createdAt: FieldValue.serverTimestamp() })
  } catch (e) {
    if (!isAlreadyExists(e)) throw e // a concurrent writer won the race — the established ref stands
  }
}

// ── DriveRootGrant ───────────────────────────────────────────────────────────────

const grants = () => getDb().collection(COL.driveRootGrants)

export async function findRootGrantByEmail(email: string): Promise<DriveRootGrantRow | null> {
  const snap = await grants().doc(driveRootGrantId(email)).get()
  return snap.exists ? snapToRow(snap) : null
}

export async function upsertRootGrant(input: UpsertRootGrantInput): Promise<void> {
  const db = getDb()
  const ref = grants().doc(driveRootGrantId(input.email))
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const mutable = {
      userId: input.userId,
      email: input.email,
      role: input.role,
      permissionId: input.permissionId,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (snap.exists) tx.update(ref, mutable)
    else tx.set(ref, { ...mutable, grantedAt: FieldValue.serverTimestamp() })
  })
}

export async function countReaderGrants(): Promise<number> {
  const agg = await grants().where('role', '==', 'reader').count().get()
  return agg.data().count
}

export async function listAllRootGrants(): Promise<DriveRootGrantRow[]> {
  const snap = await grants().get()
  return snap.docs.map(snapToRow)
}

export async function listReaderGrants(): Promise<DriveRootGrantRow[]> {
  const snap = await grants().where('role', '==', 'reader').get()
  return snap.docs.map(snapToRow)
}

export async function updateRootGrantPermissionId(id: string, permissionId: string | null): Promise<void> {
  await grants().doc(id).update({ permissionId, updatedAt: FieldValue.serverTimestamp() })
}

export async function markRootGrantInvalid(id: string): Promise<void> {
  await grants().doc(id).update({ role: 'invalid', permissionId: null, updatedAt: FieldValue.serverTimestamp() })
}

export async function deleteRootGrant(id: string): Promise<void> {
  await grants().doc(id).delete()
}
