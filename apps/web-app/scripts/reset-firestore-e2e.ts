// Per-scenario Firestore reset for the Cucumber e2e suite (DATA_BACKEND=firestore) — the Firestore
// analog of `pnpm seed:dummy` (which TRUNCATEs the *_e2e Postgres DB and re-seeds). Spawned by
// apps/web-app-e2e/support/db.ts before each scenario.
//
//   1. Clear ALL Firestore data via the emulator's clear endpoint (the TRUNCATE analog).
//   2. seedFirestoreFactory()  — desks + role bundles + config v1 (cleared along with everything).
//   3. seedFirestoreDemo({clean:false})  — seeded actors/personas + FOS-2026-* apps + meetings + routing.
//
// HARD GUARD: refuses to run unless FIRESTORE_EMULATOR_HOST is set — the clear endpoint only exists on
// the emulator, but we assert it explicitly so this can NEVER wipe a real project.
import { seedFirestoreFactory } from '@/server/config/seed-firestore'
import { seedFirestoreDemo } from '@/server/config/seed-firestore-demo'

const EMU = process.env.FIRESTORE_EMULATOR_HOST
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'demo-mizan'

async function clearEmulator(): Promise<void> {
  const url = `http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Firestore emulator clear failed (${res.status}): ${await res.text().catch(() => '')}`)
}

async function main() {
  if (!EMU) {
    throw new Error('refusing to run: FIRESTORE_EMULATOR_HOST is not set (this script clears ALL data; emulator only)')
  }
  await clearEmulator()
  await seedFirestoreFactory()
  const demo = await seedFirestoreDemo({ clean: false })
  console.log('Firestore e2e reset:', demo)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('reset-firestore-e2e failed:', e)
    process.exit(1)
  })
