import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './extraction-run.prisma'
import * as firestoreImpl from './extraction-run.firestore'

// ExtractionRun persistence — dispatcher (routes to Prisma/Firestore by DATA_BACKEND). Consumer:
// server/docs/service.ts (syncApplicationDocs / syncExtractionFromMarkdown / getApplicationDocs).
export type { CreateExtractionRunInput, ExtractionRunRow } from './extraction-run.prisma'

export const createExtractionRun = dispatchWrite('createExtractionRun', prismaImpl.createExtractionRun, firestoreImpl.createExtractionRun)
export const getLatestExtractionRun = dispatchRead(prismaImpl.getLatestExtractionRun, firestoreImpl.getLatestExtractionRun)
export const getLatestOkExtractionRun = dispatchRead(prismaImpl.getLatestOkExtractionRun, firestoreImpl.getLatestOkExtractionRun)
