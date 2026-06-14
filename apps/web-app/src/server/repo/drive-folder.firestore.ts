import 'server-only'

import { getDb } from '@/server/firebase/firestore'
import { appRef, COL } from '@/server/firebase/collections'
import type { ApplicationFolderRefs } from './drive-folder.prisma'

// Firestore impl of the Drive folder-link persistence — parity with drive-folder.prisma.ts. The
// Prisma relational join (application → customer) becomes two doc reads: the app root doc (customerId +
// its own driveFolderId), then the linked customer doc (its driveFolderId). The setters merge-update
// only the folder fields. driveFolderId/driveFolderOwner are aggregate-external side-channel fields
// (preserved across aggregate saves, which use tx.update / merge).

export async function getApplicationFolderRefs(appId: string): Promise<ApplicationFolderRefs> {
  const db = getDb()
  const appSnap = await appRef(db, appId).get()
  if (!appSnap.exists) return { customerId: null, appDriveFolderId: null, customerDriveFolderId: null }
  const a = appSnap.data() as Record<string, unknown>
  const customerId = (a.customerId as string | null | undefined) ?? null
  const appDriveFolderId = (a.driveFolderId as string | null | undefined) ?? null
  let customerDriveFolderId: string | null = null
  if (customerId) {
    const custSnap = await db.collection(COL.customers).doc(customerId).get()
    const cd = custSnap.exists ? (custSnap.data() as Record<string, unknown>) : null
    customerDriveFolderId = (cd?.driveFolderId as string | null | undefined) ?? null
  }
  return { customerId, appDriveFolderId, customerDriveFolderId }
}

export async function setAppDriveFolder(appId: string, folderId: string, owner: string): Promise<void> {
  await appRef(getDb(), appId).update({ driveFolderId: folderId, driveFolderOwner: owner })
}

export async function setCustomerDriveFolder(customerId: string, folderId: string, owner: string): Promise<void> {
  await getDb().collection(COL.customers).doc(customerId).update({ driveFolderId: folderId, driveFolderOwner: owner })
}
