import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  enqueueResearchJob,
  listQueuedJobIds,
  claimQueuedJob,
  setJobPlan,
  updateJobProgress,
  bumpJobUsage,
  appendExploredSources,
  isCancelRequested,
  requestCancel,
  finalizeJob,
  markStaleRunningAsFailedRestart,
  getJob,
  getLatestJobForApp,
  recordStep,
} from './job'
import { getDb } from '@/server/firebase/firestore'
import { COL, RESEARCH_STEPS_SUB } from '@/server/firebase/collections'
import { clearFirestore } from '@/server/repo/fs-test-helpers'

// Firestore-emulator itest for the research-job lifecycle under DATA_BACKEND=firestore. Verifies the
// dispatcher routes to job.firestore.ts: enqueue/claim(tx)/plan/progress/usage(increment)/explored
// sources/cancel/finalize(elapsed)/restart-sweep/recordStep. Parity target: research/job.prisma.ts.

const SRC = (url: string) => ({ url, title: 't', claim: 'a grounded claim '.repeat(2), retrievedAt: new Date(0).toISOString() })

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('enqueue → getJob/getLatestJobForApp return a queued record with defaults', async () => {
  const id = await enqueueResearchJob('APP-1')
  const job = await getJob(id)
  assert.ok(job)
  assert.equal(job.appId, 'APP-1')
  assert.equal(job.status, 'queued')
  assert.equal(job.tokensUsed, 0)
  assert.equal(job.cancelRequested, false)
  assert.equal(job.startedAt, null)
  assert.ok(job.createdAt instanceof Date)
  const latest = await getLatestJobForApp('APP-1')
  assert.equal(latest?.id, id)
})

test('claimQueuedJob is single-winner; flips to running with startedAt', async () => {
  const id = await enqueueResearchJob('APP-1')
  assert.equal(await claimQueuedJob(id), true)
  const job = await getJob(id)
  assert.equal(job?.status, 'running')
  assert.ok(job?.startedAt instanceof Date)
  assert.equal(await claimQueuedJob(id), false) // already claimed
})

test('listQueuedJobIds returns queued ids, excludes claimed, respects limit', async () => {
  const a = await enqueueResearchJob('A')
  const b = await enqueueResearchJob('B')
  const c = await enqueueResearchJob('C')
  await claimQueuedJob(a) // now running → excluded
  const ids = await listQueuedJobIds(10)
  assert.deepEqual([...ids].sort(), [b, c].sort())
  assert.equal((await listQueuedJobIds(1)).length, 1)
})

test('plan / progress / usage / explored-sources persist and read back', async () => {
  const id = await enqueueResearchJob('APP-1')
  await setJobPlan(id, { questions: [{ question: 'q1', rationale: 'r1' }] })
  await updateJobProgress(id, { currentSubQ: 2, lastActivity: 'fetching', lastUpdate: new Date(0).toISOString() })
  await bumpJobUsage(id, { tokens: 100, llmCalls: 2, fetches: 3 })
  await bumpJobUsage(id, { tokens: 50 }) // increments accumulate
  await appendExploredSources(id, [SRC('https://a.example')])
  await appendExploredSources(id, [SRC('https://b.example')])

  const job = await getJob(id)
  assert.equal(job?.plan?.questions[0].question, 'q1')
  assert.equal(job?.progress?.currentSubQ, 2)
  assert.equal(job?.tokensUsed, 150)
  assert.equal(job?.llmCalls, 2)
  assert.equal(job?.fetches, 3)
  assert.equal(job?.exploredSourcesPartial?.length, 2)
  assert.equal(job?.exploredSourcesPartial?.[1].url, 'https://b.example')
})

test('requestCancel sets the cancel flag the agent polls', async () => {
  const id = await enqueueResearchJob('APP-1')
  assert.equal(await isCancelRequested(id), false)
  await requestCancel(id)
  assert.equal(await isCancelRequested(id), true)
})

test('finalizeJob records terminal status + elapsedMs + extras', async () => {
  const id = await enqueueResearchJob('APP-1')
  await claimQueuedJob(id) // sets startedAt → elapsed is computable
  await finalizeJob(id, 'completed', { costEstimateUsd: 1.5 })
  const job = await getJob(id)
  assert.equal(job?.status, 'completed')
  assert.ok(job?.completedAt instanceof Date)
  assert.equal(typeof job?.elapsedMs, 'number')
  assert.ok((job?.elapsedMs ?? -1) >= 0)
  assert.equal(job?.costEstimateUsd, 1.5)

  const failed = await enqueueResearchJob('APP-2')
  await finalizeJob(failed, 'failed', { errorMessage: 'boom' })
  const fj = await getJob(failed)
  assert.equal(fj?.status, 'failed')
  assert.equal(fj?.errorMessage, 'boom')
  assert.equal(fj?.elapsedMs, null) // never started → no elapsed
})

test('markStaleRunningAsFailedRestart flips leftover running jobs', async () => {
  const a = await enqueueResearchJob('A')
  const b = await enqueueResearchJob('B')
  await claimQueuedJob(a)
  await claimQueuedJob(b)
  const swept = await markStaleRunningAsFailedRestart()
  assert.equal(swept, 2)
  assert.equal((await getJob(a))?.status, 'failed-restart')
  assert.equal((await getJob(b))?.errorMessage, 'process restarted before job finished; please re-queue')
})

test('recordStep writes an audit row in the steps subcollection', async () => {
  const id = await enqueueResearchJob('APP-1')
  await recordStep(id, { stepType: 'plan', response: 'planned', tokensIn: 5, tokensOut: 7 })
  await recordStep(id, { stepType: 'fetch', url: 'https://x.example' })
  const steps = await getDb().collection(COL.researchJobs).doc(id).collection(RESEARCH_STEPS_SUB).get()
  assert.equal(steps.size, 2)
  const types = steps.docs.map((d) => d.data().stepType).sort()
  assert.deepEqual(types, ['fetch', 'plan'])
})
