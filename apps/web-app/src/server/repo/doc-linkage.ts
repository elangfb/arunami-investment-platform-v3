import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './doc-linkage.prisma'
import * as firestoreImpl from './doc-linkage.firestore'

// DocLinkage persistence — dispatcher (routes to Prisma/Firestore by DATA_BACKEND). Consumers:
// server/docs/service.ts (the Doc lifecycle) + server/docs/mizan-drive.ts (shortcut warnings).
export type { DocLinkageRow, UpsertDocLinkageInput, DocLinkagePatch } from './doc-linkage.prisma'

export const getDocLinkage = dispatchRead(prismaImpl.getDocLinkage, firestoreImpl.getDocLinkage)
export const getDocLinkageOrThrow = dispatchRead(prismaImpl.getDocLinkageOrThrow, firestoreImpl.getDocLinkageOrThrow)
export const upsertDocLinkage = dispatchWrite('upsertDocLinkage', prismaImpl.upsertDocLinkage, firestoreImpl.upsertDocLinkage)
export const updateDocLinkage = dispatchWrite('updateDocLinkage', prismaImpl.updateDocLinkage, firestoreImpl.updateDocLinkage)
