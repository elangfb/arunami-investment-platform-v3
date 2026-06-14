import 'server-only'

import { prisma } from '@/server/db'

// Drive folder-link persistence (discovery) — Prisma impl, routed behind drive-folder.ts by
// DATA_BACKEND; the Firestore twin is drive-folder.firestore.ts. The RM links a Drive folder to either
// the application (its own per-deal folder) or the linked Customer (the nasabah folder, carried across
// deals). These are user-owned source-upload folders (distinct from the Mizan-owned generated-doc
// folder in application-drive.ts). Consumers: server/actions/discovery-actions.core.ts + server/discovery/discover.ts.

export interface ApplicationFolderRefs {
  customerId: string | null
  appDriveFolderId: string | null
  customerDriveFolderId: string | null
}

export async function getApplicationFolderRefs(appId: string): Promise<ApplicationFolderRefs> {
  const row = await prisma.application.findUnique({
    where: { id: appId },
    select: { customerId: true, driveFolderId: true, customer: { select: { id: true, driveFolderId: true } } },
  })
  return {
    customerId: row?.customer?.id ?? row?.customerId ?? null,
    appDriveFolderId: row?.driveFolderId ?? null,
    customerDriveFolderId: row?.customer?.driveFolderId ?? null,
  }
}

export async function setAppDriveFolder(appId: string, folderId: string, owner: string): Promise<void> {
  await prisma.application.update({ where: { id: appId }, data: { driveFolderId: folderId, driveFolderOwner: owner } })
}

export async function setCustomerDriveFolder(customerId: string, folderId: string, owner: string): Promise<void> {
  await prisma.customer.update({ where: { id: customerId }, data: { driveFolderId: folderId, driveFolderOwner: owner } })
}
