import 'server-only'

import { prisma } from '@/server/db'

// Targeted Application drive-field accessors — Prisma impl, routed behind application-drive.ts by
// DATA_BACKEND; Firestore twin is application-drive.firestore.ts. These are NON-aggregate, side-channel
// fields (Drive folder pointers + a few read-only facts) read/written OUTSIDE the version-guarded
// aggregate write seam — exactly as the prior direct prisma.application.update did. `mizanDocFolderId`
// is also part of the aggregate (round-trips via the domain); `driveFolderId` is aggregate-external and
// preserved across saves because the firestore save uses tx.update (merge), not a full set.

export interface ApplicationDriveFields {
  stage: number
  nasabahName: string
  driveFolderId: string | null
  mizanDocFolderId: string | null
  exploredSources: unknown
}

export async function getApplicationDriveFields(appId: string): Promise<ApplicationDriveFields | null> {
  const row = await prisma.application.findUnique({
    where: { id: appId },
    select: { stage: true, nasabahName: true, driveFolderId: true, mizanDocFolderId: true, exploredSources: true },
  })
  if (!row) return null
  return {
    stage: row.stage,
    nasabahName: row.nasabahName,
    driveFolderId: row.driveFolderId,
    mizanDocFolderId: row.mizanDocFolderId,
    exploredSources: row.exploredSources ?? null,
  }
}

export async function setMizanDocFolderId(appId: string, folderId: string): Promise<void> {
  await prisma.application.update({ where: { id: appId }, data: { mizanDocFolderId: folderId } })
}

export async function setDriveFolderId(appId: string, folderId: string): Promise<void> {
  await prisma.application.update({ where: { id: appId }, data: { driveFolderId: folderId } })
}
