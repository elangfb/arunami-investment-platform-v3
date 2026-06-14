import 'server-only'

import { getDb } from '@/server/firebase/firestore'
import { appRef } from '@/server/firebase/collections'
import type { ApplicationDriveFields } from './application-drive.prisma'

// Firestore impl of the targeted Application drive-field accessors — parity with
// application-drive.prisma.ts. Reads the application root doc (one get) and projects the side-channel
// fields; the setters use appRef.update() (a MERGE — never a full set), so they touch only the named
// folder field and leave the aggregate (version, history, …) untouched.

export async function getApplicationDriveFields(appId: string): Promise<ApplicationDriveFields | null> {
  const snap = await appRef(getDb(), appId).get()
  if (!snap.exists) return null
  const d = snap.data() as Record<string, unknown>
  return {
    stage: (d.stage as number | undefined) ?? 0,
    nasabahName: (d.nasabahName as string | undefined) ?? '',
    driveFolderId: (d.driveFolderId as string | null | undefined) ?? null,
    mizanDocFolderId: (d.mizanDocFolderId as string | null | undefined) ?? null,
    exploredSources: d.exploredSources ?? null,
  }
}

export async function setMizanDocFolderId(appId: string, folderId: string): Promise<void> {
  await appRef(getDb(), appId).update({ mizanDocFolderId: folderId })
}

export async function setDriveFolderId(appId: string, folderId: string): Promise<void> {
  await appRef(getDb(), appId).update({ driveFolderId: folderId })
}
