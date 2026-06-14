// Worker hermetic tests are NOT meaningful — the worker module transitively imports
// `@/server/db`, which throws at module load without DATABASE_URL (correct fail-fast).
// Real worker behavior (tick → claim → run → finalize, cancellation, restart-sweep) is
// covered by integration tests under apps/web-app/src/server/research/*.itest.ts when
// the integration harness lands.
//
// Pure value-only tests for the budget constants live in `job.budget.test.ts` (no DB).
export {}
