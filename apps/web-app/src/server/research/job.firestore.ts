import 'server-only'

import { FieldValue, type Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL, RESEARCH_STEPS_SUB } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import { log } from '@/server/log'
import { NotFoundError } from '@/server/repo/errors'
import type { ExploredSource } from './pipeline'
import type {
  ResearchJobStatus,
  ResearchPlan,
  ResearchProgress,
  ResearchJobRecord,
  ResearchStepInput,
} from './job.shared'

/**
 * ResearchJob lifecycle (Firestore impl) — parity with job.prisma.ts. Jobs live at
 * researchJobs/{jobId}; per-step OJK audit rows in the researchJobs/{jobId}/steps subcollection.
 * claimQueuedJob is a transaction (read status=queued → set running), the Firestore analog of the
 * Prisma updateMany compare-and-set; usage bumps use FieldValue.increment. Routed behind the
 * dispatcher (job.ts) by DATA_BACKEND.
 */

type Data = Record<string, unknown>

function jobRef(jobId: string) {
  return getDb().collection(COL.researchJobs).doc(jobId)
}

function docToRecord(s: DocumentSnapshot): ResearchJobRecord {
  const d = (s.data() ?? {}) as Data
  return {
    id: s.id,
    appId: d.appId as string,
    status: d.status as ResearchJobStatus,
    plan: (d.plan as ResearchPlan | null) ?? null,
    progress: (d.progress as ResearchProgress | null) ?? null,
    exploredSourcesPartial: (d.exploredSourcesPartial as ExploredSource[] | null) ?? null,
    costEstimateUsd: (d.costEstimateUsd as number | null) ?? null,
    tokensUsed: (d.tokensUsed as number | undefined) ?? 0,
    llmCalls: (d.llmCalls as number | undefined) ?? 0,
    fetches: (d.fetches as number | undefined) ?? 0,
    cancelRequested: (d.cancelRequested as boolean | undefined) ?? false,
    startedAt: toDate(d.startedAt as Timestamp | undefined) ?? null,
    completedAt: toDate(d.completedAt as Timestamp | undefined) ?? null,
    elapsedMs: (d.elapsedMs as number | null) ?? null,
    errorMessage: (d.errorMessage as string | null) ?? null,
    createdAt: toDate(d.createdAt as Timestamp | undefined) ?? new Date(0),
  }
}

/** Create a queued job at the dispatcher-allocated id (so dual-mode aligns with Postgres). */
export async function enqueueResearchJob(id: string, appId: string): Promise<string> {
  await jobRef(id).create({
    appId,
    status: 'queued',
    plan: null,
    progress: null,
    exploredSourcesPartial: null,
    costEstimateUsd: null,
    tokensUsed: 0,
    llmCalls: 0,
    fetches: 0,
    cancelRequested: false,
    startedAt: null,
    completedAt: null,
    elapsedMs: null,
    errorMessage: null,
    createdAt: FieldValue.serverTimestamp(),
  })
  log.info('research_enqueued', { jobId: id, appId })
  return id
}

/** Oldest `limit` queued job ids (worker pull order). Needs the (status, createdAt asc) index. */
export async function listQueuedJobIds(limit: number): Promise<string[]> {
  const snap = await getDb()
    .collection(COL.researchJobs)
    .where('status', '==', 'queued')
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get()
  return snap.docs.map((d) => d.id)
}

/** Atomically claim a queued job → running. Returns false if it was already claimed/moved. */
export async function claimQueuedJob(jobId: string): Promise<boolean> {
  const db = getDb()
  const ref = jobRef(jobId)
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists || (s.data() as Data).status !== 'queued') return false
    tx.update(ref, { status: 'running', startedAt: FieldValue.serverTimestamp() })
    return true
  })
}

/** Persist a plan after the planner step. */
export async function setJobPlan(jobId: string, plan: ResearchPlan): Promise<void> {
  await jobRef(jobId).update({ plan })
}

/** Update progress liveness fields (called between sub-questions). */
export async function updateJobProgress(jobId: string, progress: ResearchProgress): Promise<void> {
  await jobRef(jobId).update({ progress })
}

/** Append a freshly-consolidated ExploredSource set so cancellation captures partial work. Read+concat
 *  (the agent runs one job sequentially, so no concurrent appender races this). */
export async function appendExploredSources(jobId: string, more: ExploredSource[]): Promise<void> {
  const ref = jobRef(jobId)
  const snap = await ref.get()
  if (!snap.exists) throw new NotFoundError(`researchJob ${jobId}`)
  const existing = ((snap.data() as Data).exploredSourcesPartial as ExploredSource[] | null) ?? []
  await ref.update({ exploredSourcesPartial: [...existing, ...more] })
}

/** Increment usage counters atomically (called by each step). */
export async function bumpJobUsage(
  jobId: string,
  delta: { tokens?: number; llmCalls?: number; fetches?: number },
): Promise<void> {
  await jobRef(jobId).update({
    tokensUsed: FieldValue.increment(delta.tokens ?? 0),
    llmCalls: FieldValue.increment(delta.llmCalls ?? 0),
    fetches: FieldValue.increment(delta.fetches ?? 0),
  })
}

/** Read cancellation flag — agent polls between sub-questions. */
export async function isCancelRequested(jobId: string): Promise<boolean> {
  const s = await jobRef(jobId).get()
  return s.exists ? ((s.data() as Data).cancelRequested as boolean | undefined) ?? false : false
}

/** UI/action flips this; agent picks it up on the next sub-Q boundary. */
export async function requestCancel(jobId: string): Promise<void> {
  await jobRef(jobId).update({ cancelRequested: true })
  log.info('research_cancel_requested', { jobId })
}

/** Terminal transition. Computes elapsedMs from startedAt, mirroring the Prisma path. */
export async function finalizeJob(
  jobId: string,
  kind: Exclude<ResearchJobStatus, 'queued' | 'running'>,
  extras: { errorMessage?: string; costEstimateUsd?: number } = {},
): Promise<void> {
  const ref = jobRef(jobId)
  const snap = await ref.get()
  if (!snap.exists) throw new NotFoundError(`researchJob ${jobId}`) // parity with findUniqueOrThrow
  const startedAt = toDate((snap.data() as Data).startedAt as Timestamp | undefined)
  const elapsedMs = startedAt ? Date.now() - startedAt.getTime() : null
  await ref.update({
    status: kind,
    completedAt: FieldValue.serverTimestamp(),
    elapsedMs,
    errorMessage: extras.errorMessage ?? null,
    costEstimateUsd: extras.costEstimateUsd ?? null,
  })
  log.info('research_finalized', { jobId, kind, elapsedMs })
}

/** Boot-time restart guard — flip any leftover `running` job (dead process) to `failed-restart`. */
export async function markStaleRunningAsFailedRestart(): Promise<number> {
  const db = getDb()
  const snap = await db.collection(COL.researchJobs).where('status', '==', 'running').get()
  if (snap.empty) return 0
  const batch = db.batch()
  for (const d of snap.docs) {
    batch.update(d.ref, {
      status: 'failed-restart',
      completedAt: FieldValue.serverTimestamp(),
      errorMessage: 'process restarted before job finished; please re-queue',
    })
  }
  await batch.commit()
  log.warn('research_failed_restart_sweep', { count: snap.size })
  return snap.size
}

/** Lightweight read for UI / API. */
export async function getJob(jobId: string): Promise<ResearchJobRecord | null> {
  const s = await jobRef(jobId).get()
  return s.exists ? docToRecord(s) : null
}

/** Latest job for an application — needs the (appId, createdAt desc) index. */
export async function getLatestJobForApp(appId: string): Promise<ResearchJobRecord | null> {
  const snap = await getDb()
    .collection(COL.researchJobs)
    .where('appId', '==', appId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  return snap.empty ? null : docToRecord(snap.docs[0])
}

/**
 * Record a single step (search/fetch/LLM-call/refusal/etc.) for OJK-grade auditability under
 * researchJobs/{jobId}/steps/{autoId}. The caller masks PII before calling (this does NOT mask).
 */
export async function recordStep(jobId: string, step: ResearchStepInput): Promise<void> {
  await jobRef(jobId).collection(RESEARCH_STEPS_SUB).add({
    stepType: step.stepType,
    query: step.query ?? null,
    url: step.url ?? null,
    prompt: step.prompt ?? null,
    response: step.response ?? null,
    tokensIn: step.tokensIn ?? 0,
    tokensOut: step.tokensOut ?? 0,
    durationMs: step.durationMs ?? 0,
    errorMessage: step.errorMessage ?? null,
    timestamp: FieldValue.serverTimestamp(),
  })
}
