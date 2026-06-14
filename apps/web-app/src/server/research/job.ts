import 'server-only'

import { dataBackend } from '@/server/repo/backend'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { log, errField } from '@/server/log'
import { newResearchJobId } from './job.shared'
import * as prismaImpl from './job.prisma'
import * as firestoreImpl from './job.firestore'

// ResearchJob lifecycle — dispatcher. Routes each primitive to the Prisma or Firestore impl by
// DATA_BACKEND, exactly like the repo seam. Types + budget + id allocation live in job.shared.ts.
// Callers keep importing '@/server/research/job' unchanged.

export type {
  ResearchJobStatus,
  ResearchPlan,
  ResearchProgress,
  ResearchJobRecord,
  ResearchStepInput,
} from './job.shared'
export { RESEARCH_BUDGET } from './job.shared'

/**
 * Enqueue a research job. The id is allocated HERE (backend-agnostic) and passed to both impls so a
 * dual-mode shadow writes the SAME id to Postgres and Firestore — a per-impl random id would desync
 * the shadow, leaving later setJobPlan/recordStep(jobId) writes pointing at a non-existent shadow doc.
 */
export async function enqueueResearchJob(appId: string): Promise<string> {
  const id = newResearchJobId()
  if (dataBackend() === 'firestore') return firestoreImpl.enqueueResearchJob(id, appId)
  const result = await prismaImpl.enqueueResearchJob(id, appId)
  if (dataBackend() === 'dual') {
    try {
      await firestoreImpl.enqueueResearchJob(id, appId)
    } catch (e) {
      log.warn('firestore shadow-write failed', { op: 'enqueueResearchJob', ...errField(e) })
    }
  }
  return result
}

export const listQueuedJobIds = dispatchRead(prismaImpl.listQueuedJobIds, firestoreImpl.listQueuedJobIds)
export const claimQueuedJob = dispatchWrite('claimQueuedJob', prismaImpl.claimQueuedJob, firestoreImpl.claimQueuedJob)
export const setJobPlan = dispatchWrite('setJobPlan', prismaImpl.setJobPlan, firestoreImpl.setJobPlan)
export const updateJobProgress = dispatchWrite('updateJobProgress', prismaImpl.updateJobProgress, firestoreImpl.updateJobProgress)
export const appendExploredSources = dispatchWrite('appendExploredSources', prismaImpl.appendExploredSources, firestoreImpl.appendExploredSources)
export const bumpJobUsage = dispatchWrite('bumpJobUsage', prismaImpl.bumpJobUsage, firestoreImpl.bumpJobUsage)
export const requestCancel = dispatchWrite('requestCancel', prismaImpl.requestCancel, firestoreImpl.requestCancel)
export const finalizeJob = dispatchWrite('finalizeJob', prismaImpl.finalizeJob, firestoreImpl.finalizeJob)
export const markStaleRunningAsFailedRestart = dispatchWrite('markStaleRunningAsFailedRestart', prismaImpl.markStaleRunningAsFailedRestart, firestoreImpl.markStaleRunningAsFailedRestart)
export const recordStep = dispatchWrite('recordStep', prismaImpl.recordStep, firestoreImpl.recordStep)

export const isCancelRequested = dispatchRead(prismaImpl.isCancelRequested, firestoreImpl.isCancelRequested)
export const getJob = dispatchRead(prismaImpl.getJob, firestoreImpl.getJob)
export const getLatestJobForApp = dispatchRead(prismaImpl.getLatestJobForApp, firestoreImpl.getLatestJobForApp)
