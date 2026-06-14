import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './drive-folder.prisma'
import * as firestoreImpl from './drive-folder.firestore'

// Drive folder-link persistence (discovery) — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
// Consumers: server/actions/discovery-actions.core.ts + server/discovery/discover.ts.
export type { ApplicationFolderRefs } from './drive-folder.prisma'

export const getApplicationFolderRefs = dispatchRead(prismaImpl.getApplicationFolderRefs, firestoreImpl.getApplicationFolderRefs)
export const setAppDriveFolder = dispatchWrite('setAppDriveFolder', prismaImpl.setAppDriveFolder, firestoreImpl.setAppDriveFolder)
export const setCustomerDriveFolder = dispatchWrite('setCustomerDriveFolder', prismaImpl.setCustomerDriveFolder, firestoreImpl.setCustomerDriveFolder)
