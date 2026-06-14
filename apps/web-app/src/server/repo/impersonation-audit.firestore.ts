import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import type { ImpersonationStart } from './impersonation-audit.prisma'

// Firestore impl of impersonation-audit persistence — parity with impersonation-audit.prisma.ts.
// Append-only: each START is an auto-id doc in impersonationAudit (startedAt = serverTimestamp,
// endedAt = null). STOP is the Prisma `updateMany` re-expressed as a query (two equality filters,
// served without a composite index) + a batch update — only the OPEN rows get endedAt stamped, never
// reopened. The (superadminId, startedAt desc) composite index backs the session-history read.

/** Append a START row (endedAt null). */
export async function recordImpersonationStart(entry: ImpersonationStart): Promise<void> {
  await getDb().collection(COL.impersonationAudit).add({
    superadminId: entry.superadminId,
    actedAsDesk: entry.actedAsDesk,
    actedAsUserId: entry.actedAsUserId,
    reason: entry.reason,
    startedAt: FieldValue.serverTimestamp(),
    endedAt: null,
  })
}

/** Stamp endedAt on every still-open session for this real superadmin (idempotent — no open row = no-op). */
export async function endImpersonationSessions(superadminId: string): Promise<void> {
  const db = getDb()
  const snap = await db
    .collection(COL.impersonationAudit)
    .where('superadminId', '==', superadminId)
    .where('endedAt', '==', null)
    .get()
  if (snap.empty) return
  const batch = db.batch()
  for (const doc of snap.docs) batch.update(doc.ref, { endedAt: FieldValue.serverTimestamp() })
  await batch.commit()
}
