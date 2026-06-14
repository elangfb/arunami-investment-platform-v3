import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './doc-access-grant.prisma'
import * as firestoreImpl from './doc-access-grant.firestore'

// DocAccessGrant persistence — dispatcher (routes to Prisma/Firestore by DATA_BACKEND). Consumer:
// server/docs/access.ts (the just-in-time Drive sharing for per-application MUAP/RSK Docs).
export type { DocAccessGrantRow, UpsertDocGrantInput, WriterGrant } from './doc-access-grant.prisma'

export const getDocAccessGrant = dispatchRead(prismaImpl.getDocAccessGrant, firestoreImpl.getDocAccessGrant)
export const listWriterGrantsForDoc = dispatchRead(prismaImpl.listWriterGrantsForDoc, firestoreImpl.listWriterGrantsForDoc)
export const upsertDocAccessGrant = dispatchWrite('upsertDocAccessGrant', prismaImpl.upsertDocAccessGrant, firestoreImpl.upsertDocAccessGrant)
export const downgradeDocGrantToReader = dispatchWrite('downgradeDocGrantToReader', prismaImpl.downgradeDocGrantToReader, firestoreImpl.downgradeDocGrantToReader)
