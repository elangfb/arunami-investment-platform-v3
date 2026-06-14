import 'server-only'

import { prisma } from '@/server/db'

// DocumentVersion persistence — Prisma impl, routed behind document-version.ts by DATA_BACKEND; the
// Firestore twin is document-version.firestore.ts. The append-only Drive-snapshot ledger (ADR-0008):
// each row points at a read-only files.copy snapshot of a live MUAP/RSK Doc. Rows are never mutated.
// Consumers: server/docs/service.ts + the docs-rollback route. (getDocumentVersion is scoped by appId
// so a cross-application versionId resolves to null — matching the Firestore subcollection lookup.)

export interface CreateDocumentVersionInput {
  applicationId: string
  kind: string
  docId: string
  sourceDocId: string | null
  trigger: string
  label: string
  createdBy: string
  createdByName: string | null
}

export interface DocumentVersionRow {
  id: string
  applicationId: string
  kind: string
  docId: string
  sourceDocId: string | null
  trigger: string
  label: string
  createdBy: string
  createdByName: string | null
  createdAt: Date
}

export async function createDocumentVersion(input: CreateDocumentVersionInput): Promise<DocumentVersionRow> {
  return prisma.documentVersion.create({ data: { ...input } })
}

export async function listDocumentVersions(applicationId: string): Promise<DocumentVersionRow[]> {
  return prisma.documentVersion.findMany({ where: { applicationId }, orderBy: [{ createdAt: 'desc' }] })
}

export async function getDocumentVersion(applicationId: string, versionId: string): Promise<DocumentVersionRow | null> {
  return prisma.documentVersion.findFirst({ where: { id: versionId, applicationId } })
}
