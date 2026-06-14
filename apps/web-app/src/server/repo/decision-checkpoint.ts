import 'server-only'

import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './decision-checkpoint.prisma'
import * as firestoreImpl from './decision-checkpoint.firestore'

// DecisionCheckpoint WRITE persistence — dispatcher (routes to Prisma/Firestore by DATA_BACKEND). The
// READ that feeds the application aggregate (latestCheckpoint) lives in serialize.*; this is the create
// + the audit-download PDF-refs read. Consumer: server/docs/service.ts (freezeDecisionDocs / checkpointPdf).
export type { CreateCheckpointInput, CheckpointPdfRefs } from './decision-checkpoint.prisma'

export const createDecisionCheckpoint = dispatchWrite('createDecisionCheckpoint', prismaImpl.createDecisionCheckpoint, firestoreImpl.createDecisionCheckpoint)
export const getLatestCheckpointPdfRefs = dispatchRead(prismaImpl.getLatestCheckpointPdfRefs, firestoreImpl.getLatestCheckpointPdfRefs)
