import 'server-only'

import { prisma } from '@/server/db'

// DocAccessGrant persistence — Prisma impl, routed behind the dispatcher (doc-access-grant.ts) by
// DATA_BACKEND; the Firestore twin is doc-access-grant.firestore.ts. This is the idempotency guard +
// audit record for per-(Drive doc, email) permission grants on the per-application MUAP/RSK Docs
// (server/docs/access.ts). The Drive API orchestration stays in access.ts; only the row persistence
// lives here. @@unique([docId, email]) → the (docId,email) pair is the identity.

export interface DocAccessGrantRow {
  role: string // 'reader' | 'writer'
  permissionId: string | null
}

export interface UpsertDocGrantInput {
  applicationId: string
  docId: string
  email: string
  role: string
  permissionId: string | null
  grantedToUserId: string
}

/** One writer grant row (the fields reconcileFrozenDocGrants needs to downgrade + audit). */
export interface WriterGrant {
  email: string
  permissionId: string | null
  grantedToUserId: string
}

export async function getDocAccessGrant(docId: string, email: string): Promise<DocAccessGrantRow | null> {
  const row = await prisma.docAccessGrant.findUnique({
    where: { docId_email: { docId, email } },
    select: { role: true, permissionId: true },
  })
  return row ?? null
}

export async function upsertDocAccessGrant(input: UpsertDocGrantInput): Promise<void> {
  await prisma.docAccessGrant.upsert({
    where: { docId_email: { docId: input.docId, email: input.email } },
    create: {
      applicationId: input.applicationId,
      docId: input.docId,
      email: input.email,
      role: input.role,
      permissionId: input.permissionId,
      grantedToUserId: input.grantedToUserId,
    },
    update: { role: input.role, permissionId: input.permissionId, grantedToUserId: input.grantedToUserId },
  })
}

export async function listWriterGrantsForDoc(docId: string): Promise<WriterGrant[]> {
  return prisma.docAccessGrant.findMany({
    where: { docId, role: 'writer' },
    select: { email: true, permissionId: true, grantedToUserId: true },
  })
}

export async function downgradeDocGrantToReader(docId: string, email: string): Promise<void> {
  await prisma.docAccessGrant.update({
    where: { docId_email: { docId, email } },
    data: { role: 'reader' },
  })
}
