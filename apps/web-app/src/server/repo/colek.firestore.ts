import 'server-only'
import { FieldValue, type Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import { NotFoundError } from './errors'
import { ACTIVE_COLEK_STATUSES, type ColekRow, type ColekStatus, type CreateColekInput, type ColekReassignmentEntry } from './colek.prisma'

// Firestore impl of the COLEK (cross-desk work request) repo — parity with colek.prisma.ts. Stored
// in deskAssignments/{auto-id}. createColek/complete/reject use serverTimestamp() then READ BACK the
// committed snapshot (critique #21: never return the pre-commit payload holding the unresolved
// sentinel). reassignColek is a tx read-modify-write that concats reassignmentLog.

type Data = Record<string, unknown>

function snapToColek(s: DocumentSnapshot): ColekRow {
  const d = (s.data() ?? {}) as Data
  return {
    id: s.id,
    applicationId: d.applicationId as string,
    targetDesk: d.targetDesk as string,
    assigneeUserId: d.assigneeUserId as string,
    assigneeName: d.assigneeName as string,
    requestedBy: d.requestedBy as string,
    requestedByName: d.requestedByName as string,
    description: d.description as string,
    status: d.status as ColekStatus,
    createdAt: toDate(d.createdAt as Timestamp | undefined) ?? new Date(0),
    completedAt: toDate(d.completedAt as Timestamp | null | undefined) ?? null,
    reassignmentLog: (d.reassignmentLog as ColekReassignmentEntry[] | null | undefined) ?? null,
  }
}

export async function createColek(input: CreateColekInput): Promise<ColekRow> {
  const ref = getDb().collection(COL.deskAssignments).doc()
  await ref.set({
    applicationId: input.applicationId,
    targetDesk: input.targetDesk,
    assigneeUserId: input.assigneeUserId,
    assigneeName: input.assigneeName,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    description: input.description,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    completedAt: null,
    reassignmentLog: null,
  })
  return snapToColek(await ref.get())
}

export async function getColek(id: string): Promise<ColekRow | null> {
  const s = await getDb().collection(COL.deskAssignments).doc(id).get()
  return s.exists ? snapToColek(s) : null
}

export async function listColeksForApp(applicationId: string): Promise<ColekRow[]> {
  const snap = await getDb().collection(COL.deskAssignments).where('applicationId', '==', applicationId).orderBy('createdAt', 'desc').get()
  return snap.docs.map(snapToColek)
}

export async function activeColekForDesk(applicationId: string, targetDesk: string): Promise<ColekRow | null> {
  const snap = await getDb()
    .collection(COL.deskAssignments)
    .where('applicationId', '==', applicationId)
    .where('targetDesk', '==', targetDesk)
    .where('status', 'in', ACTIVE_COLEK_STATUSES)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  return snap.empty ? null : snapToColek(snap.docs[0])
}

export async function listPendingColeksForUser(userId: string): Promise<ColekRow[]> {
  const snap = await getDb()
    .collection(COL.deskAssignments)
    .where('assigneeUserId', '==', userId)
    .where('status', 'in', ACTIVE_COLEK_STATUSES)
    .orderBy('createdAt', 'desc')
    .get()
  return snap.docs.map(snapToColek)
}

export async function activeDealCountsByDesk(
  targetDesk: string,
): Promise<Map<string, { count: number; lastAssignedAt: string | null }>> {
  const snap = await getDb()
    .collection(COL.deskAssignments)
    .where('targetDesk', '==', targetDesk)
    .where('status', 'in', ACTIVE_COLEK_STATUSES)
    .select('assigneeUserId', 'createdAt')
    .get()
  const map = new Map<string, { count: number; lastAssignedAt: string | null }>()
  for (const doc of snap.docs) {
    const d = doc.data() as Data
    const uid = d.assigneeUserId as string
    const at = (toDate(d.createdAt as Timestamp | undefined) ?? new Date(0)).toISOString()
    const prev = map.get(uid)
    if (!prev) map.set(uid, { count: 1, lastAssignedAt: at })
    else {
      prev.count += 1
      if (prev.lastAssignedAt == null || at > prev.lastAssignedAt) prev.lastAssignedAt = at
    }
  }
  return map
}

export async function completeColek(id: string): Promise<ColekRow> {
  const ref = getDb().collection(COL.deskAssignments).doc(id)
  await ref.update({ status: 'completed', completedAt: FieldValue.serverTimestamp() })
  return snapToColek(await ref.get())
}

export async function rejectColek(id: string, reason: string): Promise<ColekRow> {
  void reason // audited on the Application's HistoryEntry ledger by the action layer, not a row column
  const ref = getDb().collection(COL.deskAssignments).doc(id)
  await ref.update({ status: 'rejected', completedAt: FieldValue.serverTimestamp() })
  return snapToColek(await ref.get())
}

export async function reassignColek(
  id: string,
  newAssignee: { id: string; name: string },
  by: string,
  reason: string,
): Promise<ColekRow> {
  const db = getDb()
  const ref = db.collection(COL.deskAssignments).doc(id)
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref)
    if (!cur.exists) throw new NotFoundError(`Colek ${id}`)
    const prev = ((cur.data() as Data).reassignmentLog as ColekReassignmentEntry[] | null) ?? []
    const log: ColekReassignmentEntry[] = [
      ...prev,
      { from: (cur.data() as Data).assigneeUserId as string, to: newAssignee.id, by, reason, at: new Date().toISOString() },
    ]
    tx.update(ref, { assigneeUserId: newAssignee.id, assigneeName: newAssignee.name, status: 'pending', reassignmentLog: log })
  })
  return snapToColek(await ref.get())
}
