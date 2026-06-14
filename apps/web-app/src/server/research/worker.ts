import 'server-only'

import { log, errField } from '@/server/log'
import { claimQueuedJob, finalizeJob, markStaleRunningAsFailedRestart, listQueuedJobIds } from './job'

/**
 * In-process polling worker for ResearchJob.
 *
 * Single setInterval pulls up to MAX_CONCURRENT queued jobs every POLL_MS, claims each via
 * atomic updateMany (status='queued'→'running'), and fires off `runResearchJob` async/await
 * without awaiting — the agent loop runs in the event loop alongside web requests.
 *
 * Restart-safety: on `startResearchWorker()`, any `running` row from a previous process is
 * flipped to `failed-restart`. Granular sub-Q resume is deferred.
 *
 * Gate: worker is OPT-IN via `RESEARCH_WORKER_ENABLED=1` env. By default it does NOT start,
 * so the schema + lifecycle ship safely with no behavior change. To enable in dev/prod, set
 * the env flag and call `startResearchWorker()` from your app boot path.
 */

const POLL_MS = 10_000
const MAX_CONCURRENT = 5

/** Bound by the worker process; counts jobs currently being run in this Node instance. */
let inFlight = 0

/** setInterval handle, captured so tests / SIGTERM handlers can stop the worker. */
let intervalHandle: NodeJS.Timeout | null = null

/**
 * Runner registry — the agent module (T8/T9) registers its run function here at import.
 * This decouples job lifecycle from agent implementation so T7 can ship + be tested
 * without T8 in place.
 */
type RunnerFn = (jobId: string) => Promise<void>
let runner: RunnerFn | null = null

/** Called by T8/T9 to plug the agent into the worker. */
export function registerResearchRunner(fn: RunnerFn): void {
  runner = fn
}

async function tick(): Promise<void> {
  if (inFlight >= MAX_CONCURRENT) return
  const slotsFree = MAX_CONCURRENT - inFlight
  const queuedIds = await listQueuedJobIds(slotsFree)
  for (const jobId of queuedIds) {
    const claimed = await claimQueuedJob(jobId)
    if (!claimed) continue // another worker (or same loop reentry) claimed it first
    if (!runner) {
      // No agent registered — finalize as failed so the job doesn't sit forever and the
      // analyst gets a clear signal. This is the safe default if config drifts.
      await finalizeJob(jobId, 'failed', {
        errorMessage: 'no research runner registered (agent module not loaded)',
      })
      continue
    }
    inFlight++
    // Intentionally NOT awaited — agent runs concurrent with the next tick.
    runner(jobId)
      .catch(async (e: unknown) => {
        log.error('research_runner_threw', { jobId, ...errField(e) })
        try {
          await finalizeJob(jobId, 'failed', {
            errorMessage: e instanceof Error ? e.message : String(e),
          })
        } catch (e2: unknown) {
          log.error('research_finalize_failed', { jobId, ...errField(e2) })
        }
      })
      .finally(() => {
        inFlight--
      })
  }
}

/**
 * Start the polling worker. Idempotent — calling twice is a no-op.
 * Returns the interval handle so callers can stop it (tests, graceful shutdown).
 */
export async function startResearchWorker(): Promise<NodeJS.Timeout | null> {
  if (intervalHandle) return intervalHandle
  if (process.env.RESEARCH_WORKER_ENABLED !== '1') {
    log.info('research_worker_disabled', { reason: 'RESEARCH_WORKER_ENABLED != 1' })
    return null
  }
  const swept = await markStaleRunningAsFailedRestart()
  log.info('research_worker_starting', { pollMs: POLL_MS, maxConcurrent: MAX_CONCURRENT, swept })
  intervalHandle = setInterval(() => {
    tick().catch((e: unknown) => log.error('research_tick_failed', { ...errField(e) }))
  }, POLL_MS)
  // Don't keep the Node process alive purely to poll.
  intervalHandle.unref?.()
  return intervalHandle
}

/** Graceful stop — used by tests + SIGTERM handlers. */
export function stopResearchWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

/** Test-only accessor so unit tests can exercise the tick loop deterministically. */
export const __testing = {
  tick,
  getInFlight: () => inFlight,
  resetRunner: () => {
    runner = null
  },
}
