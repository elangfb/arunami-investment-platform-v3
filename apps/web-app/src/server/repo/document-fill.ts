import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './document-fill.prisma'
import * as firestoreImpl from './document-fill.firestore'

// ApplicationDocumentFill persistence — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
// Consumers: server/docs/sync-v2.ts (sync-back) + server/templates/lost-in-doc.ts (recovery).
export type { DocumentFillRow, LostFillRow, DocumentFillPatch } from './document-fill.prisma'

export const latestFillSyncedAt = dispatchRead(prismaImpl.latestFillSyncedAt, firestoreImpl.latestFillSyncedAt)
export const listFills = dispatchRead(prismaImpl.listFills, firestoreImpl.listFills)
export const listLostFills = dispatchRead(prismaImpl.listLostFills, firestoreImpl.listLostFills)
export const updateFill = dispatchWrite('updateFill', prismaImpl.updateFill, firestoreImpl.updateFill)
