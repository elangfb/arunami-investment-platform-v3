'use server'

import { requireActor } from '@/server/auth/session'
import { rateLimit } from '@/server/rate-limit'
import { loadApplicationForWrite } from '@/server/repo/write'
import { assertCanWorkDesk } from '@/lib/auth/can'
import {
  enqueueResearchJob,
  requestCancel,
  getJob,
  getLatestJobForApp,
} from '@/server/research/job'

/**
 * Research-job server actions — used by the cancellation UI (T11) and the manual
 * "Riset Ulang" trigger. Mirrors the existing runWebResearchAction's auth + rate-limit
 * surface, but queues the background job instead of running synchronously.
 */

export async function enqueueResearchJobAction(appId: string): Promise<{ jobId: string }> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertCanWorkDesk(actor, app, 'muap-author')
  const rl = rateLimit(`research:enqueue:${actor.userId}`, 3, 60_000)
  if (!rl.ok) throw new Error('Terlalu banyak permintaan. Coba lagi sebentar.')
  const jobId = await enqueueResearchJob(appId)
  return { jobId }
}

export async function cancelResearchJobAction(jobId: string): Promise<void> {
  const actor = await requireActor()
  const job = await getJob(jobId)
  if (!job) throw new Error('Job not found')
  const app = await loadApplicationForWrite(job.appId)
  if (!app) throw new Error('Application not found')
  assertCanWorkDesk(actor, app, 'muap-author')
  await requestCancel(jobId)
}

/** Read the latest job for UI polling. Read-only, no rate-limit (cheap). */
export async function getLatestResearchJobAction(appId: string) {
  await requireActor()
  return getLatestJobForApp(appId)
}
