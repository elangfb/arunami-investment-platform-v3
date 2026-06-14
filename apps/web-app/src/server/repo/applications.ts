import 'server-only'
import { dispatchRead } from './dispatch'
import * as prismaImpl from './applications.prisma'
import * as firestoreImpl from './applications.firestore'

// Application read paths — dispatcher. Routes to the Prisma or Firestore impl by DATA_BACKEND
// (all reads; the Prisma impl keeps its React cache() wrapper, so per-request dedupe is preserved).
// Callers keep importing '@/server/repo/applications' unchanged.

export const getApplication = dispatchRead(prismaImpl.getApplication, firestoreImpl.getApplication)
export const getLineage = dispatchRead(prismaImpl.getLineage, firestoreImpl.getLineage)
export const lineageHead = dispatchRead(prismaImpl.lineageHead, firestoreImpl.lineageHead)
export const listApplications = dispatchRead(prismaImpl.listApplications, firestoreImpl.listApplications)
export const listUnansweredMentions = dispatchRead(prismaImpl.listUnansweredMentions, firestoreImpl.listUnansweredMentions)
export const listUnscheduledCommitteeCandidates = dispatchRead(
  prismaImpl.listUnscheduledCommitteeCandidates,
  firestoreImpl.listUnscheduledCommitteeCandidates,
)
export const listApplicationsWithMizanFolder = dispatchRead(
  prismaImpl.listApplicationsWithMizanFolder,
  firestoreImpl.listApplicationsWithMizanFolder,
)
export const getApplicationCustomerId = dispatchRead(prismaImpl.getApplicationCustomerId, firestoreImpl.getApplicationCustomerId)
export const countApplications = dispatchRead(prismaImpl.countApplications, firestoreImpl.countApplications)

export type { CommitteeAgendaCandidate, ApplicationFolderRef } from './applications.prisma'
