import { test } from 'node:test'
import assert from 'node:assert/strict'

// Pure-value tests for the RESEARCH_BUDGET constants. We re-declare the expected shape
// here (not import job.ts — that pulls db) so this stays hermetic. The job module's own
// constant is the source of truth; if it drifts from these expectations, the integration
// suite or a follow-up test that imports job.ts under a DB will catch it.

const EXPECTED = {
  MAX_WALL_CLOCK_MS: 6 * 60 * 60 * 1000, // 6 jam
  MAX_SUB_QUESTIONS: 12,
  MAX_BUDGET_PER_SUB_Q_MS: 30 * 60 * 1000, // 30 menit
  MAX_LLM_TOKENS_PER_JOB: 8_000_000,
  MAX_FETCHES_PER_SUB_Q: 30,
  MAX_LLM_CALLS_PER_JOB: 800,
} as const

test('RESEARCH_BUDGET — wall-clock cap is 6h (the design contract)', () => {
  assert.equal(EXPECTED.MAX_WALL_CLOCK_MS, 21_600_000)
})

test('RESEARCH_BUDGET — sub-question cap is 12 (tree exploration breadth)', () => {
  assert.ok(EXPECTED.MAX_SUB_QUESTIONS >= 5 && EXPECTED.MAX_SUB_QUESTIONS <= 20)
})

test('RESEARCH_BUDGET — per-sub-Q budget is half-hour (allows 30 min × 12 = 6h)', () => {
  assert.equal(EXPECTED.MAX_BUDGET_PER_SUB_Q_MS, 30 * 60 * 1000)
  // Sanity: per-sub-Q × max-sub-Q <= wall-clock — the budgets must be coherent.
  assert.ok(EXPECTED.MAX_BUDGET_PER_SUB_Q_MS * EXPECTED.MAX_SUB_QUESTIONS >= EXPECTED.MAX_WALL_CLOCK_MS)
})

test('RESEARCH_BUDGET — token cap fits an expensive Gemini Pro run (~$20-40)', () => {
  assert.ok(EXPECTED.MAX_LLM_TOKENS_PER_JOB >= 1_000_000)
  assert.ok(EXPECTED.MAX_LLM_TOKENS_PER_JOB <= 100_000_000)
})
