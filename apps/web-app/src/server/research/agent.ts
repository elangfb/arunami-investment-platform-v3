import 'server-only'

import { getApplication } from '@/server/repo/applications'
import { log, errField } from '@/server/log'
import { planResearch } from '@/lib/research/classifier'
import { runWebResearch } from './pipeline'
import type { ResearchContext } from './provider'
import {
  appendExploredSources,
  bumpJobUsage,
  finalizeJob,
  getJob,
  isCancelRequested,
  recordStep,
  RESEARCH_BUDGET,
  setJobPlan,
  updateJobProgress,
  type ResearchPlan,
} from './job'

/**
 * Tree-exploration research agent — POC scaffolding (T8 of muap-template-engine-v2 build).
 *
 * Scope (per design doc §"POC deep research agent"):
 *   - One hardcoded sub-question per app (no real planner yet — T9 wires in Gemini-driven
 *     sub-question generation).
 *   - Wall-clock cap = 15 minutes (NOT the 6h production cap; POC uses tightened safety
 *     limit so a misbehaving run can't burn the budget unnoticed).
 *   - Real Gemini synthesis via existing `runWebResearch` pipeline; the agent's own
 *     contribution at POC stage is (a) job-lifecycle plumbing, (b) per-step ResearchStep
 *     audit rows, and (c) the registration hook so `worker.startResearchWorker()` can
 *     dispatch.
 *
 * T9 extends:
 *   - Real planner: Gemini "given this application's namaUsaha/akadType, list 5-12 sub-
 *     questions to research" call → persisted as ResearchPlan.
 *   - Per-sub-Q context refinement (each sub-Q gets a `ResearchContext` tweaked by the
 *     sub-question's focus).
 *   - Multi-sub-Q loop with cancellation polling between sub-questions.
 *   - SearXNG + Firecrawl provider switch via `WEB_RESEARCH_PROVIDER`.
 *
 * Compliance hooks already in place from `runWebResearch`:
 *   - `planResearch()` (classifier) refuses egress when individual nasabah / missing
 *     business name / structured PII.
 *   - `recordAiInteraction()` writes the AI summary row (G3 masked-prompt audit). The
 *     agent additionally writes per-step rows to `ResearchStep` for finer-grained audit.
 */

const POC_WALL_CLOCK_MS = 15 * 60 * 1000

/** POC plan: single fixed sub-question. Retained for POC tests + back-compat. */
function makePocPlan(): ResearchPlan {
  return {
    questions: [
      {
        question: 'industry-overview',
        rationale:
          'POC stub — broad business overview using existing pipeline planner (classifier-derived queries).',
      },
    ],
  }
}

/**
 * T9 plan generator — derives 4-6 sub-questions deterministically from the egress
 * classifier's safe-query set. Each query becomes its own sub-Q so the agent loop can
 * tackle them independently with per-step audit + cancellation polling between them.
 *
 * This is intentionally NOT an LLM planner — keeping sub-Q generation deterministic
 * preserves OJK-auditability (no model freedom in the plan). True LLM-driven tree-
 * exploration (5-12 sub-Qs with rationales) is a later refinement that requires its own
 * compliance review for the new prompt surface.
 */
function makeRealPlan(ctx: ResearchContext): ResearchPlan {
  const safe = planResearch(ctx)
  if (!safe) {
    // Classifier refused (individual nasabah or PII-laden context) — no sub-questions.
    return { questions: [] }
  }
  return {
    questions: safe.queries.map((q, i) => ({
      question: q,
      rationale:
        i === 0
          ? 'business profile / akta'
          : i === 1
            ? 'legal registry (Kemenkumham/AHU)'
            : i === 2
              ? 'business permits (SIUP/NIB/OSS)'
              : 'sector + purpose anchor',
    })),
  }
}

/** Look up the application context the pipeline needs from an appId. */
async function loadContextForJob(jobId: string): Promise<{ ctx: ResearchContext; appId: string }> {
  const job = await getJob(jobId)
  if (!job) throw new Error(`research_agent: job ${jobId} not found`)
  const app = await getApplication(job.appId)
  if (!app) throw new Error(`research_agent: app ${job.appId} not found`)
  const ctx: ResearchContext = {
    namaUsaha: app.namaUsaha ?? null,
    nasabahType: app.nasabahType,
    akadType: app.akadType,
    purpose: app.purpose,
    collateralType: app.collateralType,
  }
  return { ctx, appId: job.appId }
}

/**
 * Run one job — called by the worker's dispatch loop.
 *
 * Failure handling: any thrown error is surfaced as `failed` by the worker's wrapper.
 * Inside this function, individual step failures are caught + logged + recorded as a
 * `refusal`/error step and the loop continues (POC has only 1 sub-Q, so this is largely
 * a no-op until T9 adds the multi-sub-Q loop).
 */
export async function runPocResearchJob(jobId: string): Promise<void> {
  const startedMs = Date.now()
  log.info('research_job_running', { jobId })

  const { ctx, appId } = await loadContextForJob(jobId)
  const plan = makePocPlan()
  await setJobPlan(jobId, plan)
  await recordStep(jobId, {
    stepType: 'plan',
    response: JSON.stringify(plan),
  })

  let totalSources = 0

  for (const [i, subQ] of plan.questions.entries()) {
    // Wall-clock cap check (POC tighter than production)
    if (Date.now() - startedMs > POC_WALL_CLOCK_MS) {
      await finalizeJob(jobId, 'completed-capped', {
        errorMessage: `POC wall-clock cap (${POC_WALL_CLOCK_MS}ms) exceeded`,
      })
      return
    }

    // Cancellation poll between sub-questions — agent contract per design.
    if (await isCancelRequested(jobId)) {
      log.info('research_job_cancelled_midflight', { jobId, completedSubQ: i })
      await finalizeJob(jobId, 'cancelled')
      return
    }

    await updateJobProgress(jobId, {
      currentSubQ: i,
      lastActivity: `running sub-question: ${subQ.question}`,
      lastUpdate: new Date().toISOString(),
    })

    const stepStart = Date.now()
    try {
      const sources = await runWebResearch({
        appId,
        userId: 'system:research-agent',
        ctx,
      })
      const durationMs = Date.now() - stepStart
      await appendExploredSources(jobId, sources)
      await bumpJobUsage(jobId, { llmCalls: 1, fetches: sources.length })
      await recordStep(jobId, {
        stepType: 'consolidate',
        query: subQ.question,
        response: `consolidated ${sources.length} sources`,
        durationMs,
      })
      totalSources += sources.length
    } catch (e: unknown) {
      const durationMs = Date.now() - stepStart
      log.error('research_subq_failed', { jobId, subQ: subQ.question, ...errField(e) })
      await recordStep(jobId, {
        stepType: 'refusal',
        query: subQ.question,
        errorMessage: e instanceof Error ? e.message : String(e),
        durationMs,
      })
      // Continue to next sub-Q (POC has 1 so we just fall through to finalize).
    }
  }

  await finalizeJob(jobId, totalSources > 0 ? 'completed' : 'completed-partial', {
    // POC: no cost meter yet. T9 computes from tokensUsed + provider rates.
    costEstimateUsd: undefined,
  })
}

/** Sanity guard: budget caps used by POC are strictly tighter than production caps. */
export function assertPocBudgetTighter(): void {
  if (POC_WALL_CLOCK_MS >= RESEARCH_BUDGET.MAX_WALL_CLOCK_MS) {
    throw new Error('POC wall-clock cap must be tighter than the production cap')
  }
}

/**
 * T9 production runner — multi-sub-question loop with per-step audit + cancellation
 * polling between sub-questions. Uses the full RESEARCH_BUDGET caps (6h wall-clock).
 *
 * Each sub-Q runs the deterministic pipeline (runWebResearch — classifier → search →
 * fetch → synthesize → drop hallucinated URLs). Provider is selected by env
 * (WEB_RESEARCH_PROVIDER=searxng-firecrawl for prod; stub for dev/CI).
 *
 * Compliance: per `apps/web-app/AGENTS.md`, the classifier strips PII upstream, the
 * Firecrawl/SearXNG egress is business-entity-only, and the synthesis schema enforces
 * citations come from the input corpus (no hallucinated URLs). G3 audit via per-step
 * ResearchStep rows + the pipeline's own recordAiInteraction.
 */
export async function runResearchJob(jobId: string): Promise<void> {
  const startedMs = Date.now()
  log.info('research_job_running', { jobId, mode: 'production' })

  const { ctx, appId } = await loadContextForJob(jobId)
  const plan = makeRealPlan(ctx)
  await setJobPlan(jobId, plan)
  await recordStep(jobId, { stepType: 'plan', response: JSON.stringify(plan) })

  if (plan.questions.length === 0) {
    log.info('research_job_no_plan', { jobId, reason: 'classifier_refused_or_no_business_name' })
    await finalizeJob(jobId, 'completed-partial', {
      errorMessage: 'No safe sub-questions for this application (individual nasabah or missing business name)',
    })
    return
  }

  let totalSources = 0
  for (const [i, subQ] of plan.questions.entries()) {
    if (Date.now() - startedMs > RESEARCH_BUDGET.MAX_WALL_CLOCK_MS) {
      await finalizeJob(jobId, 'completed-capped', {
        errorMessage: `wall-clock cap (${RESEARCH_BUDGET.MAX_WALL_CLOCK_MS}ms) exceeded after sub-Q ${i}`,
      })
      return
    }
    if (await isCancelRequested(jobId)) {
      log.info('research_job_cancelled_midflight', { jobId, completedSubQ: i })
      await finalizeJob(jobId, 'cancelled')
      return
    }
    await updateJobProgress(jobId, {
      currentSubQ: i,
      lastActivity: `running sub-question: ${subQ.question}`,
      lastUpdate: new Date().toISOString(),
    })

    const stepStart = Date.now()
    try {
      const sources = await runWebResearch({
        appId,
        userId: 'system:research-agent',
        ctx,
      })
      const durationMs = Date.now() - stepStart
      await appendExploredSources(jobId, sources)
      await bumpJobUsage(jobId, { llmCalls: 1, fetches: sources.length })
      await recordStep(jobId, {
        stepType: 'consolidate',
        query: subQ.question,
        response: `consolidated ${sources.length} sources`,
        durationMs,
      })
      totalSources += sources.length
    } catch (e: unknown) {
      const durationMs = Date.now() - stepStart
      log.error('research_subq_failed', { jobId, subQ: subQ.question, ...errField(e) })
      await recordStep(jobId, {
        stepType: 'refusal',
        query: subQ.question,
        errorMessage: e instanceof Error ? e.message : String(e),
        durationMs,
      })
    }
  }

  await finalizeJob(jobId, totalSources > 0 ? 'completed' : 'completed-partial')
}
