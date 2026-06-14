import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './application-drive.prisma'
import * as firestoreImpl from './application-drive.firestore'

// Targeted Application drive-field accessors — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
// Consumers: server/docs/mizan-drive.ts, server/docs/service.ts, server/discovery/discover.ts.
export type { ApplicationDriveFields } from './application-drive.prisma'

export const getApplicationDriveFields = dispatchRead(prismaImpl.getApplicationDriveFields, firestoreImpl.getApplicationDriveFields)
export const setMizanDocFolderId = dispatchWrite('setMizanDocFolderId', prismaImpl.setMizanDocFolderId, firestoreImpl.setMizanDocFolderId)
export const setDriveFolderId = dispatchWrite('setDriveFolderId', prismaImpl.setDriveFolderId, firestoreImpl.setDriveFolderId)
