import 'server-only'
import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './source-manifest.prisma'
import * as firestoreImpl from './source-manifest.firestore'

// Source-doc manifest repo — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
export type { ManifestScope, ScanEntryInput, SourceDocManifestRow } from './source-manifest.prisma'

export const appendScanEntries = dispatchWrite('appendScanEntries', prismaImpl.appendScanEntries, firestoreImpl.appendScanEntries)
export const listManifest = dispatchRead(prismaImpl.listManifest, firestoreImpl.listManifest)
export const latestPerDocType = dispatchRead(prismaImpl.latestPerDocType, firestoreImpl.latestPerDocType)
