import 'server-only'
import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './colek.prisma'
import * as firestoreImpl from './colek.firestore'

// COLEK (cross-desk work request) repo — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
export type { ColekStatus, ColekReassignmentEntry, ColekRow, CreateColekInput } from './colek.prisma'
export { ACTIVE_COLEK_STATUSES } from './colek.prisma'

export const createColek = dispatchWrite('createColek', prismaImpl.createColek, firestoreImpl.createColek)
export const getColek = dispatchRead(prismaImpl.getColek, firestoreImpl.getColek)
export const listColeksForApp = dispatchRead(prismaImpl.listColeksForApp, firestoreImpl.listColeksForApp)
export const activeColekForDesk = dispatchRead(prismaImpl.activeColekForDesk, firestoreImpl.activeColekForDesk)
export const listPendingColeksForUser = dispatchRead(prismaImpl.listPendingColeksForUser, firestoreImpl.listPendingColeksForUser)
export const activeDealCountsByDesk = dispatchRead(prismaImpl.activeDealCountsByDesk, firestoreImpl.activeDealCountsByDesk)
export const completeColek = dispatchWrite('completeColek', prismaImpl.completeColek, firestoreImpl.completeColek)
export const rejectColek = dispatchWrite('rejectColek', prismaImpl.rejectColek, firestoreImpl.rejectColek)
export const reassignColek = dispatchWrite('reassignColek', prismaImpl.reassignColek, firestoreImpl.reassignColek)
