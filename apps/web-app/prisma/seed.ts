/**
 * Prisma seed orchestrator.
 *   - DEV (default):        config defaults + demo data        → pnpm seed
 *   - PROD / config-only:   factory config defaults only       → pnpm seed:config  (= seed.ts --config-only)
 *
 * Split: prisma/seed-config.ts (factory defaults — desks, role bundles, each config table's v1;
 * idempotent, prod-safe) and prisma/seed-dummy.ts (demo users/applications/meetings; dev-only,
 * refuses NODE_ENV=production). The prod container runs ONLY config (compose app layer).
 *
 * Run from apps/web-app (tsx resolves the @/* tsconfig paths there):
 *   set -a; . .env.local; set +a; pnpm exec tsx prisma/seed.ts            # config + demo
 *   set -a; . .env.local; set +a; pnpm exec tsx prisma/seed.ts --config-only
 */
import { prisma } from './seed-client'
import { seedConfig } from './seed-config'
import { seedDummy } from './seed-dummy'

const configOnly = process.argv.includes('--config-only')

async function main() {
  console.log(`Seeding Mizan (Postgres)… ${configOnly ? '[config only]' : '[config + demo]'}`)
  await seedConfig()
  if (!configOnly) await seedDummy()
  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
