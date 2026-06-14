import 'server-only'

import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { subCol, SUB } from '@/server/firebase/collections'
import { toDate, tsFromDate } from '@/server/firebase/timestamps'
import { documentFillId } from './doc-ids'
import type { DocumentFillRow, LostFillRow, DocumentFillPatch } from './document-fill.prisma'

// Firestore impl of ApplicationDocumentFill — parity with document-fill.prisma.ts. Subcollection
// applications/{appId}/documentFills/{documentFillId(docId, tokenName)} — the composite doc-id enforces
// the (appId, docId, tokenName) @@unique. Read/update-only (no create sites in the codebase). Queries
// use a single equality filter (docId or status), reducing/sorting in code so no composite index is
// needed; updateFill addresses by the deterministic doc-id and throws NOT_FOUND on a missing row
// (parity with Prisma's update P2025).

const sub = (appId: string) => subCol(getDb(), appId, SUB.documentFills)

function snapToRow(s: QueryDocumentSnapshot): DocumentFillRow {
  const d = s.data()
  return {
    docId: d.docId as string,
    tokenName: d.tokenName as string,
    namedRangeId: (d.namedRangeId as string | null | undefined) ?? null,
    value: (d.value as string | null | undefined) ?? null,
    source: d.source as string,
    status: d.status as string,
    lastSyncedAt: toDate(d.lastSyncedAt) ?? new Date(0),
  }
}

export async function latestFillSyncedAt(appId: string, docId: string): Promise<Date | null> {
  const snap = await sub(appId).where('docId', '==', docId).get()
  let latest: Date | null = null
  for (const s of snap.docs) {
    const t = toDate(s.data().lastSyncedAt)
    if (t && (!latest || t.getTime() > latest.getTime())) latest = t
  }
  return latest
}

export async function listFills(appId: string, docId: string): Promise<DocumentFillRow[]> {
  const snap = await sub(appId).where('docId', '==', docId).get()
  return snap.docs.map(snapToRow)
}

export async function listLostFills(appId: string): Promise<LostFillRow[]> {
  const snap = await sub(appId).where('status', '==', 'lost-in-doc').get()
  return snap.docs
    .map(snapToRow)
    .sort((a, b) => b.lastSyncedAt.getTime() - a.lastSyncedAt.getTime()) // lastSyncedAt desc, in code
    .map((r) => ({ tokenName: r.tokenName, docId: r.docId, value: r.value, lastSyncedAt: r.lastSyncedAt }))
}

export async function updateFill(appId: string, docId: string, tokenName: string, data: DocumentFillPatch): Promise<void> {
  const patch: Record<string, unknown> = {}
  if ('value' in data) patch.value = data.value
  if ('source' in data) patch.source = data.source
  if ('status' in data) patch.status = data.status
  if ('namedRangeId' in data) patch.namedRangeId = data.namedRangeId
  if (data.lastSyncedAt !== undefined) patch.lastSyncedAt = tsFromDate(data.lastSyncedAt)
  await sub(appId).doc(documentFillId(docId, tokenName)).update(patch)
}
