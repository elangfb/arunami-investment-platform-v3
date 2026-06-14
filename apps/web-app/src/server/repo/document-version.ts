import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './document-version.prisma'
import * as firestoreImpl from './document-version.firestore'

// DocumentVersion persistence — dispatcher (routes to Prisma/Firestore by DATA_BACKEND). Consumers:
// server/docs/service.ts (snapshot/rollback) + the docs-rollback route (desk-gating read).
export type { CreateDocumentVersionInput, DocumentVersionRow } from './document-version.prisma'

export const createDocumentVersion = dispatchWrite('createDocumentVersion', prismaImpl.createDocumentVersion, firestoreImpl.createDocumentVersion)
export const listDocumentVersions = dispatchRead(prismaImpl.listDocumentVersions, firestoreImpl.listDocumentVersions)
export const getDocumentVersion = dispatchRead(prismaImpl.getDocumentVersion, firestoreImpl.getDocumentVersion)
