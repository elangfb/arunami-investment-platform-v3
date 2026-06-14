import 'server-only'

import { prisma } from '@/server/db'
import { log } from '@/server/log'
import type { ExploredSource } from './pipeline'
import type { ResearchJobStatus, ResearchPlan, ResearchProgress, ResearchJobRecord, ResearchStepInput } from './job.shared'

/**
 * ResearchJob lifecycle (Prisma impl) — pure persistence + status transitions. Routed behind the
 * dispatcher (job.ts) by DATA_BACKEND; the Firestore twin is job.firestore.ts. Types + budget +
 * id allocation live in job.shared.ts.
 *
 * The agent loop calls into these primitives; the worker (worker.ts) picks `queued` jobs and invokes
 * the runner. Cancellation lives on the row (polled between sub-questions) so cancel-from-UI works
 * across processes. Restart-safety: on boot, in-flight `running` jobs from a dead process are flipped
 * to `failed-restart` by markStaleRunningAsFailedRestart().
 */

/** Map a Prisma ResearchJob row to the backend-agnostic record (Json columns cast to their types). */
function rowToRecord(r: {
  id: string; appId: string; status: string; plan: unknown; progress: unknown
  exploredSourcesPartial: unknown; costEstimateUsd: number | null; tokensUsed: number
  llmCalls: number; fetches: number; cancelRequested: boolean; startedAt: Date | null
  completedAt: Date | null; elapsedMs: number | null; errorMessage: string | null; createdAt: Date
}): ResearchJobRecord {
  return {
    id: r.id,
    appId: r.appId,
    status: r.status as ResearchJobRecord['status'],
    plan: (r.plan as ResearchPlan | null) ?? null,
    progress: (r.progress as ResearchProgress | null) ?? null,
    exploredSourcesPartial: (r.exploredSourcesPartial as ExploredSource[] | null) ?? null,
    costEstimateUsd: r.costEstimateUsd,
    tokensUsed: r.tokensUsed,
    llmCalls: r.llmCalls,
    fetches: r.fetches,
    cancelRequested: r.cancelRequested,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    elapsedMs: r.elapsedMs,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
  }
}

/** Enqueue a research job for an application at the dispatcher-allocated id. Returns the id. */
export async function enqueueResearchJob(id: string, appId: string): Promise<string> {
  const job = await prisma.researchJob.create({
    data: { id, appId, status: 'queued' },
    select: { id: true },
  })
  log.info('research_enqueued', { jobId: job.id, appId })
  return job.id
}

/** Oldest `limit` queued job ids (worker pull order). Backend-agnostic shape for worker.ts. */
export async function listQueuedJobIds(limit: number): Promise<string[]> {
  const rows = await prisma.researchJob.findMany({
    where: { status: 'queued' },
    take: limit,
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

/** Atomically claim a queued job and flip to running. Returns null if already claimed. */
export async function claimQueuedJob(jobId: string): Promise<boolean> {
  // updateMany returns count — 0 if status moved since the worker's findMany.
  const result = await prisma.researchJob.updateMany({
    where: { id: jobId, status: 'queued' },
    data: { status: 'running', startedAt: new Date() },
  })
  return result.count === 1
}

/** Persist a plan after the planner step. */
export async function setJobPlan(jobId: string, plan: ResearchPlan): Promise<void> {
  await prisma.researchJob.update({
    where: { id: jobId },
    data: { plan: plan as unknown as object },
  })
}

/** Update progress liveness fields (called between sub-questions). */
export async function updateJobProgress(jobId: string, progress: ResearchProgress): Promise<void> {
  await prisma.researchJob.update({
    where: { id: jobId },
    data: { progress: progress as unknown as object },
  })
}

/** Append a freshly-consolidated ExploredSource set so cancellation captures partial work. */
export async function appendExploredSources(
  jobId: string,
  more: ExploredSource[],
): Promise<void> {
  const row = await prisma.researchJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { exploredSourcesPartial: true },
  })
  const existing = (row.exploredSourcesPartial as ExploredSource[] | null) ?? []
  await prisma.researchJob.update({
    where: { id: jobId },
    data: { exploredSourcesPartial: [...existing, ...more] as unknown as object },
  })
}

/** Increment usage counters atomically (called by each step). */
export async function bumpJobUsage(
  jobId: string,
  delta: { tokens?: number; llmCalls?: number; fetches?: number },
): Promise<void> {
  await prisma.researchJob.update({
    where: { id: jobId },
    data: {
      tokensUsed: { increment: delta.tokens ?? 0 },
      llmCalls: { increment: delta.llmCalls ?? 0 },
      fetches: { increment: delta.fetches ?? 0 },
    },
  })
}

/** Read cancellation flag — agent polls between sub-questions. */
export async function isCancelRequested(jobId: string): Promise<boolean> {
  const row = await prisma.researchJob.findUnique({
    where: { id: jobId },
    select: { cancelRequested: true },
  })
  return row?.cancelRequested ?? false
}

/** UI/action flips this; agent picks it up on the next sub-Q boundary. */
export async function requestCancel(jobId: string): Promise<void> {
  await prisma.researchJob.update({
    where: { id: jobId },
    data: { cancelRequested: true },
  })
  log.info('research_cancel_requested', { jobId })
}

/** Terminal transition. `kind` matches the schema enum-string. */
export async function finalizeJob(
  jobId: string,
  kind: Exclude<ResearchJobStatus, 'queued' | 'running'>,
  extras: { errorMessage?: string; costEstimateUsd?: number } = {},
): Promise<void> {
  const startedRow = await prisma.researchJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { startedAt: true },
  })
  const elapsedMs = startedRow.startedAt ? Date.now() - startedRow.startedAt.getTime() : null
  await prisma.researchJob.update({
    where: { id: jobId },
    data: {
      status: kind,
      completedAt: new Date(),
      elapsedMs,
      errorMessage: extras.errorMessage ?? null,
      costEstimateUsd: extras.costEstimateUsd ?? null,
    },
  })
  log.info('research_finalized', { jobId, kind, elapsedMs })
}

/**
 * Boot-time restart guard. Any job left `running` belongs to a process that exited
 * without finalizing it — mark `failed-restart` so the UI surfaces the death and the
 * analyst can re-queue. Granular per-sub-Q resume is deferred per design.
 */
export async function markStaleRunningAsFailedRestart(): Promise<number> {
  const result = await prisma.researchJob.updateMany({
    where: { status: 'running' },
    data: {
      status: 'failed-restart',
      completedAt: new Date(),
      errorMessage: 'process restarted before job finished; please re-queue',
    },
  })
  if (result.count > 0) {
    log.warn('research_failed_restart_sweep', { count: result.count })
  }
  return result.count
}

/** Lightweight read for UI / API. */
export async function getJob(jobId: string): Promise<ResearchJobRecord | null> {
  const row = await prisma.researchJob.findUnique({ where: { id: jobId } })
  return row ? rowToRecord(row) : null
}

/** Latest job for an application — UI shows progress badge from this. */
export async function getLatestJobForApp(appId: string): Promise<ResearchJobRecord | null> {
  const row = await prisma.researchJob.findFirst({
    where: { appId },
    orderBy: { createdAt: 'desc' },
  })
  return row ? rowToRecord(row) : null
}

/**
 * Record a single step (search/fetch/LLM-call/refusal/etc.) for OJK-grade auditability.
 *
 * The caller is responsible for masking PII in `prompt`/`response` — this function does NOT
 * mask. Use `maskPii` from `lib/pii-mask.ts` on free-text fields before passing in.
 */
export async function recordStep(jobId: string, step: ResearchStepInput): Promise<void> {
  await prisma.researchStep.create({
    data: {
      jobId,
      stepType: step.stepType,
      query: step.query ?? null,
      url: step.url ?? null,
      prompt: step.prompt ?? null,
      response: step.response ?? null,
      tokensIn: step.tokensIn ?? 0,
      tokensOut: step.tokensOut ?? 0,
      durationMs: step.durationMs ?? 0,
      errorMessage: step.errorMessage ?? null,
    },
  })
}
