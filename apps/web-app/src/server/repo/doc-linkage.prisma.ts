import 'server-only'

import { prisma } from '@/server/db'

// DocLinkage persistence — Prisma impl, routed behind doc-linkage.ts by DATA_BACKEND; the Firestore
// twin is doc-linkage.firestore.ts. The 1:1-with-application hub of live generated-Doc ids (MUAP / RSK
// / MoM / SP3) + the per-app shortcut warning + template version. Mutable (upsert/partial update);
// docId = applicationId. Consumers: server/docs/service.ts + server/docs/mizan-drive.ts.

export interface DocLinkageRow {
  applicationId: string
  muapDocId: string | null
  rskDocId: string | null
  momDocId: string | null
  sp3DocId: string | null
  shortcutWarning: string | null
  templateVersion: string
  createdAt: Date
  updatedAt: Date
}

export interface UpsertDocLinkageInput {
  applicationId: string
  create: { muapDocId: string | null; rskDocId: string | null; templateVersion: string }
  update: Partial<{ muapDocId: string | null; rskDocId: string | null; templateVersion: string }>
}

export type DocLinkagePatch = Partial<{
  muapDocId: string | null
  rskDocId: string | null
  momDocId: string | null
  sp3DocId: string | null
  shortcutWarning: string | null
  templateVersion: string
}>

export async function getDocLinkage(applicationId: string): Promise<DocLinkageRow | null> {
  return prisma.docLinkage.findUnique({ where: { applicationId } })
}

export async function getDocLinkageOrThrow(applicationId: string): Promise<DocLinkageRow> {
  return prisma.docLinkage.findUniqueOrThrow({ where: { applicationId } })
}

export async function upsertDocLinkage(input: UpsertDocLinkageInput): Promise<DocLinkageRow> {
  return prisma.docLinkage.upsert({
    where: { applicationId: input.applicationId },
    create: { applicationId: input.applicationId, ...input.create },
    update: input.update,
  })
}

export async function updateDocLinkage(applicationId: string, data: DocLinkagePatch): Promise<DocLinkageRow> {
  return prisma.docLinkage.update({ where: { applicationId }, data })
}
