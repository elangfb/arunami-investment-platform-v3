// Per-scenario database reset. The harness (scripts/test-e2e.sh) does BeforeAll setup; THIS file
// resets the mutable surface between scenarios by spawning the backend-appropriate reseed:
//   • prisma   (default): `pnpm seed:dummy` — TRUNCATEs every app-scoped *_e2e table (CASCADE flushes
//                the relational tail) then re-runs seedDummy. See apps/web-app/prisma/run-seed-dummy.ts.
//   • firestore: `pnpm seed:firestore:e2e` — clears the Firestore EMULATOR then re-seeds factory +
//                demo. See apps/web-app/scripts/reset-firestore-e2e.ts.
// The backend is selected by DATA_BACKEND (mirrors server/repo/backend.ts; default 'prisma').
//
// Spawning (rather than importing) decouples the cucumber tsconfig from app-internal `@/` path
// aliases — each reseed script runs under its own TSX_TSCONFIG_PATH.
import { spawnSync } from 'node:child_process'

export async function resetScenarioState(): Promise<void> {
  const firestore = (process.env.DATA_BACKEND ?? 'prisma') === 'firestore'

  if (firestore) {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('refusing to run: DATA_BACKEND=firestore but FIRESTORE_EMULATOR_HOST is not set')
    }
  } else {
    const url = process.env.DATABASE_URL ?? ''
    if (!url.includes('mizan_e2e')) {
      throw new Error('refusing to run: DATABASE_URL is not a *mizan_e2e* database')
    }
  }

  const script = firestore ? 'seed:firestore:e2e' : 'seed:dummy'
  const result = spawnSync('pnpm', [script], {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`${script} failed (exit ${result.status})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
  }
}

export async function disconnect(): Promise<void> {
  // No cucumber-side DB connection to close — the runner is a child process. Kept as
  // an AfterAll hook for symmetry; future callers can attach a query client here if needed.
}
