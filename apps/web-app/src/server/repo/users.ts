import 'server-only'
import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './users.prisma'
import * as firestoreImpl from './users.firestore'

// Identity/access repo (users → roles → desks) — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
export type { UserWithAccess, AdminRoleRef, AdminUser, AdminRole, DeskCatalogRow } from './users.prisma'

export const getUserByFirebaseUid = dispatchRead(prismaImpl.getUserByFirebaseUid, firestoreImpl.getUserByFirebaseUid)
export const ensureUser = dispatchWrite('ensureUser', prismaImpl.ensureUser, firestoreImpl.ensureUser)
export const listUsers = dispatchRead(prismaImpl.listUsers, firestoreImpl.listUsers)
export const getUserAccessById = dispatchRead(prismaImpl.getUserAccessById, firestoreImpl.getUserAccessById)
export const getUserEmailById = dispatchRead(prismaImpl.getUserEmailById, firestoreImpl.getUserEmailById)
export const listRoles = dispatchRead(prismaImpl.listRoles, firestoreImpl.listRoles)
export const listDeskCatalog = dispatchRead(prismaImpl.listDeskCatalog, firestoreImpl.listDeskCatalog)
export const grantRole = dispatchWrite('grantRole', prismaImpl.grantRole, firestoreImpl.grantRole)
export const revokeRole = dispatchWrite('revokeRole', prismaImpl.revokeRole, firestoreImpl.revokeRole)
export const grantDesk = dispatchWrite('grantDesk', prismaImpl.grantDesk, firestoreImpl.grantDesk)
export const revokeDesk = dispatchWrite('revokeDesk', prismaImpl.revokeDesk, firestoreImpl.revokeDesk)
export const setSuperadmin = dispatchWrite('setSuperadmin', prismaImpl.setSuperadmin, firestoreImpl.setSuperadmin)
export const createRole = dispatchWrite('createRole', prismaImpl.createRole, firestoreImpl.createRole)
export const updateRoleDesks = dispatchWrite('updateRoleDesks', prismaImpl.updateRoleDesks, firestoreImpl.updateRoleDesks)
export const deleteRole = dispatchWrite('deleteRole', prismaImpl.deleteRole, firestoreImpl.deleteRole)
