import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './drive-share.prisma'
import * as firestoreImpl from './drive-share.firestore'

// DriveRef + DriveRootGrant persistence — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
// Consumer: server/docs/root-share.ts (ADR-0019 §3 V1 per-email ROOT-folder share).
export type { DriveRootGrantRow, UpsertRootGrantInput } from './drive-share.prisma'

export const getDriveRef = dispatchRead(prismaImpl.getDriveRef, firestoreImpl.getDriveRef)
export const findRootGrantByEmail = dispatchRead(prismaImpl.findRootGrantByEmail, firestoreImpl.findRootGrantByEmail)
export const countReaderGrants = dispatchRead(prismaImpl.countReaderGrants, firestoreImpl.countReaderGrants)
export const listAllRootGrants = dispatchRead(prismaImpl.listAllRootGrants, firestoreImpl.listAllRootGrants)
export const listReaderGrants = dispatchRead(prismaImpl.listReaderGrants, firestoreImpl.listReaderGrants)

export const upsertDriveRef = dispatchWrite('upsertDriveRef', prismaImpl.upsertDriveRef, firestoreImpl.upsertDriveRef)
export const upsertRootGrant = dispatchWrite('upsertRootGrant', prismaImpl.upsertRootGrant, firestoreImpl.upsertRootGrant)
export const updateRootGrantPermissionId = dispatchWrite('updateRootGrantPermissionId', prismaImpl.updateRootGrantPermissionId, firestoreImpl.updateRootGrantPermissionId)
export const markRootGrantInvalid = dispatchWrite('markRootGrantInvalid', prismaImpl.markRootGrantInvalid, firestoreImpl.markRootGrantInvalid)
export const deleteRootGrant = dispatchWrite('deleteRootGrant', prismaImpl.deleteRootGrant, firestoreImpl.deleteRootGrant)
