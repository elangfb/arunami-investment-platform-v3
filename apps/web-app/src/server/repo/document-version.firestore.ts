import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { subCol, SUB } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import type { CreateDocumentVersionInput, DocumentVersionRow } from './document-version.prisma'

// Firestore impl of DocumentVersion — parity with document-version.prisma.ts. Append-only snapshot
// ledger as a subcollection applications/{appId}/documentVersions/{auto}. createdAt server timestamp
// backs the `createdAt desc` list order (single-field index, auto). getDocumentVersion reads from the
// app's own subcollection, so a versionId from another application resolves to null (the Prisma twin
// scopes by applicationId for the same outcome).

const sub = (appId: string) => subCol(getDb(), appId, SUB.documentVersions)

function snapToRow(appId: string, s: QueryDocumentSnapshot): DocumentVersionRow {
  const d = s.data()
  return {
    id: s.id,
    applicationId: appId,
    kind: d.kind as string,
    docId: d.docId as string,
    sourceDocId: (d.sourceDocId as string | null | undefined) ?? null,
    trigger: d.trigger as string,
    label: d.label as string,
    createdBy: d.createdBy as string,
    createdByName: (d.createdByName as string | null | undefined) ?? null,
    createdAt: toDate(d.createdAt) ?? new Date(0),
  }
}

export async function createDocumentVersion(input: CreateDocumentVersionInput): Promise<DocumentVersionRow> {
  const ref = await sub(input.applicationId).add({
    applicationId: input.applicationId,
    kind: input.kind,
    docId: input.docId,
    sourceDocId: input.sourceDocId,
    trigger: input.trigger,
    label: input.label,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: FieldValue.serverTimestamp(),
  })
  const snap = await ref.get()
  return snapToRow(input.applicationId, snap as QueryDocumentSnapshot)
}

export async function listDocumentVersions(applicationId: string): Promise<DocumentVersionRow[]> {
  const snap = await sub(applicationId).orderBy('createdAt', 'desc').get()
  return snap.docs.map((s) => snapToRow(applicationId, s))
}

export async function getDocumentVersion(applicationId: string, versionId: string): Promise<DocumentVersionRow | null> {
  const snap = await sub(applicationId).doc(versionId).get()
  return snap.exists ? snapToRow(applicationId, snap as QueryDocumentSnapshot) : null
}
