import { randomUUID } from 'node:crypto'
import type { ExploredSource } from './pipeline'

// Backend-agnostic research-job types + constants, shared by job.prisma.ts, job.firestore.ts, the
// dispatcher (job.ts), and the agent runner. Pure (no prisma / no firestore / no server-only) so it
// can be imported from anywhere without dragging a data graph. Mirrors the serialize.shared split.

export type ResearchJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed-partial'
  | 'completed-capped'
  | 'failed'
  | 'failed-restart'
  | 'cancelled'

export interface ResearchPlan {
  questions: Array<{ question: string; rationale: string }>
}

export interface ResearchProgress {
  currentSubQ: number
  lastActivity: string
  lastUpdate: string // ISO
}

/** The job record shape returned by getJob / getLatestJobForApp — identical across backends. Dates
 *  are real Date objects (Prisma returns Date; the Firestore impl converts Timestamp→Date) so the
 *  cancellation UI's `new Date(startedAt)` + status polling behave the same on either backend. */
export interface ResearchJobRecord {
  id: string
  appId: string
  status: ResearchJobStatus
  plan: ResearchPlan | null
  progress: ResearchProgress | null
  exploredSourcesPartial: ExploredSource[] | null
  costEstimateUsd: number | null
  tokensUsed: number
  llmCalls: number
  fetches: number
  cancelRequested: boolean
  startedAt: Date | null
  completedAt: Date | null
  elapsedMs: number | null
  errorMessage: string | null
  createdAt: Date
}

/** A single audited step (search/fetch/LLM-call/refusal) — the recordStep input. */
export interface ResearchStepInput {
  stepType: 'plan' | 'search' | 'fetch' | 'synthesize' | 'consolidate' | 'refusal'
  query?: string
  url?: string
  prompt?: string
  response?: string
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
  errorMessage?: string
}

/** Hardcoded MVP budget caps. Migrate to admin policy versioned table later. */
export const RESEARCH_BUDGET = {
  MAX_WALL_CLOCK_MS: 6 * 60 * 60 * 1000, // 6 jam
  MAX_SUB_QUESTIONS: 12,
  MAX_BUDGET_PER_SUB_Q_MS: 30 * 60 * 1000, // 30 menit
  MAX_LLM_TOKENS_PER_JOB: 8_000_000, // ~$20-40 Gemini Pro
  MAX_FETCHES_PER_SUB_Q: 30,
  MAX_LLM_CALLS_PER_JOB: 800,
} as const

/** Backend-agnostic job id, allocated in the dispatcher so dual-mode writes the SAME id to both
 *  Postgres and Firestore (a per-impl random id would desync the shadow). Opaque/format-agnostic. */
export function newResearchJobId(): string {
  return randomUUID()
}
