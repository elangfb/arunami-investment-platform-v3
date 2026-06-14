import 'server-only'

import { prisma } from '@/server/db'

// DriveRef + DriveRootGrant persistence — Prisma impl, routed behind the dispatcher (drive-share.ts)
// by DATA_BACKEND; the Firestore twin is drive-share.firestore.ts. Backs server/docs/root-share.ts
// (ADR-0019 §3 V1 per-email ROOT-folder share). DriveRef row 'mizan-root' pins the root folder id
// (first-writer-wins); DriveRootGrant is the per-email 'reader' (or 'invalid' marker) ledger +
// idempotency guard. The Drive API orchestration stays in root-share.ts; only row persistence is here.
//
// `id` is an OPAQUE handle for update/delete (a Prisma cuid here; the email-derived docId in Firestore)
// — callers (revoke/reconcile) only round-trip it back into this module, never interpret it.

export interface DriveRootGrantRow {
  id: string
  userId: string
  email: string
  role: string // 'reader' | 'invalid'
  permissionId: string | null
}

export interface UpsertRootGrantInput {
  userId: string
  email: string
  role: string
  permissionId: string | null
}

// ── DriveRef (the singleton root-folder registry) ──────────────────────────────

export async function getDriveRef(key: string): Promise<{ folderId: string } | null> {
  const ref = await prisma.driveRef.findUnique({ where: { key }, select: { folderId: true } })
  return ref ?? null
}

/** First-writer-wins: an established ref is never repointed (update: {}). */
export async function upsertDriveRef(key: string, folderId: string): Promise<void> {
  await prisma.driveRef.upsert({ where: { key }, create: { key, folderId }, update: {} })
}

// ── DriveRootGrant (the per-email reader ledger) ───────────────────────────────

export async function findRootGrantByEmail(email: string): Promise<DriveRootGrantRow | null> {
  const row = await prisma.driveRootGrant.findUnique({
    where: { email },
    select: { id: true, userId: true, email: true, role: true, permissionId: true },
  })
  return row ?? null
}

export async function upsertRootGrant(input: UpsertRootGrantInput): Promise<void> {
  await prisma.driveRootGrant.upsert({
    where: { email: input.email },
    create: { userId: input.userId, email: input.email, role: input.role, permissionId: input.permissionId },
    update: { userId: input.userId, role: input.role, permissionId: input.permissionId },
  })
}

export async function countReaderGrants(): Promise<number> {
  return prisma.driveRootGrant.count({ where: { role: 'reader' } })
}

export async function listAllRootGrants(): Promise<DriveRootGrantRow[]> {
  return prisma.driveRootGrant.findMany({
    select: { id: true, userId: true, email: true, role: true, permissionId: true },
  })
}

export async function listReaderGrants(): Promise<DriveRootGrantRow[]> {
  return prisma.driveRootGrant.findMany({
    where: { role: 'reader' },
    select: { id: true, userId: true, email: true, role: true, permissionId: true },
  })
}

export async function updateRootGrantPermissionId(id: string, permissionId: string | null): Promise<void> {
  await prisma.driveRootGrant.update({ where: { id }, data: { permissionId } })
}

export async function markRootGrantInvalid(id: string): Promise<void> {
  await prisma.driveRootGrant.update({ where: { id }, data: { role: 'invalid', permissionId: null } })
}

export async function deleteRootGrant(id: string): Promise<void> {
  await prisma.driveRootGrant.delete({ where: { id } })
}
