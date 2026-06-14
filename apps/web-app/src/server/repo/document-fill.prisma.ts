import 'server-only'

import { prisma } from '@/server/db'

// ApplicationDocumentFill persistence — Prisma impl, routed behind document-fill.ts by DATA_BACKEND;
// the Firestore twin is document-fill.firestore.ts. The per-(app, docId, tokenName) v2 fill ledger +
// lost-in-doc recovery state. There are NO create sites in the codebase (the v2 fill engine writes are
// not wired) — this module is read/update-only and effectively dormant; migrated for parity. Consumers:
// server/docs/sync-v2.ts + server/templates/lost-in-doc.ts. updateFill addresses by the (docId,tokenName)
// composite within an app, matching the @@unique([appId, docId, tokenName]).

export interface DocumentFillRow {
  docId: string
  tokenName: string
  namedRangeId: string | null
  value: string | null
  source: string
  status: string
  lastSyncedAt: Date
}

export interface LostFillRow {
  tokenName: string
  docId: string
  value: string | null
  lastSyncedAt: Date
}

export type DocumentFillPatch = Partial<{
  value: string | null
  source: string
  status: string
  namedRangeId: string | null
  lastSyncedAt: Date
}>

export async function latestFillSyncedAt(appId: string, docId: string): Promise<Date | null> {
  const row = await prisma.applicationDocumentFill.findFirst({
    where: { appId, docId },
    orderBy: { lastSyncedAt: 'desc' },
    select: { lastSyncedAt: true },
  })
  return row?.lastSyncedAt ?? null
}

export async function listFills(appId: string, docId: string): Promise<DocumentFillRow[]> {
  return prisma.applicationDocumentFill.findMany({
    where: { appId, docId },
    select: { docId: true, tokenName: true, namedRangeId: true, value: true, source: true, status: true, lastSyncedAt: true },
  })
}

export async function listLostFills(appId: string): Promise<LostFillRow[]> {
  const rows = await prisma.applicationDocumentFill.findMany({
    where: { appId, status: 'lost-in-doc' },
    orderBy: { lastSyncedAt: 'desc' },
    select: { tokenName: true, docId: true, value: true, lastSyncedAt: true },
  })
  return rows.map((r) => ({ tokenName: r.tokenName, docId: r.docId, value: r.value, lastSyncedAt: r.lastSyncedAt }))
}

export async function updateFill(appId: string, docId: string, tokenName: string, data: DocumentFillPatch): Promise<void> {
  await prisma.applicationDocumentFill.update({
    where: { appId_docId_tokenName: { appId, docId, tokenName } },
    data,
  })
}
