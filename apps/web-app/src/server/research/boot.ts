import 'server-only'

import { registerResearchRunner, startResearchWorker } from './worker'
import { runPocResearchJob, runResearchJob } from './agent'
import { log } from '@/server/log'

/**
 * One-shot boot for the research subsystem — call once at app startup.
 *
 * Registers the POC agent runner with the worker, then starts the worker loop
 * (which itself is opt-in via `RESEARCH_WORKER_ENABLED=1`). If the env flag is
 * unset, the runner is still registered (so direct invocations work) but no
 * polling happens.
 *
 * Idempotent — safe to call from layout.tsx or wherever boot lives. The
 * underlying worker module guards against double-start.
 */
let booted = false
export async function bootResearchSubsystem(): Promise<void> {
  if (booted) return
  booted = true
  // Pick runner by env: production multi-sub-Q (default) or POC single-sub-Q (regression
  // / cost-eval). Both honour budgets + cancellation + per-step audit; production runs
  // through the egress classifier's full safe-query set.
  const useProd = process.env.RESEARCH_AGENT_MODE !== 'poc'
  registerResearchRunner(useProd ? runResearchJob : runPocResearchJob)
  const handle = await startResearchWorker()
  log.info('research_subsystem_booted', { workerStarted: handle !== null, mode: useProd ? 'production' : 'poc' })
}
