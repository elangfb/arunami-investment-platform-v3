// Greenfield Firestore factory seed — desk catalog + system role bundles + every config table's v1
// baseline. The Firestore analog of `pnpm seed:config` (prisma/seed-config.ts). Idempotent +
// prod-safe: touches NO users/applications/meetings/audits, so it's safe to run on every deploy.
// Run ONCE on a fresh Firestore before first use.
//
// Targets whatever the Admin SDK resolves: the local emulator when FIRESTORE_EMULATOR_HOST is set,
// otherwise the real project via ADC / FIREBASE_SERVICE_ACCOUNT.
//   Emulator:  pnpm emu   then   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm seed:firestore
//   Prod:      (ADC / service account in env)   pnpm seed:firestore
import { seedFirestoreFactory } from '@/server/config/seed-firestore'

async function main() {
  const r = await seedFirestoreFactory()
  console.log('Firestore factory seeded (idempotent):', {
    desks: r.desks,
    roles: r.roles,
    config: { seeded: r.config.seeded.length, skipped: r.config.skipped.length },
  })
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('seed:firestore failed:', e)
    process.exit(1)
  })
