/**
 * Optimistic-concurrency guard proof (Tier 1.2). Mirrors the exact guard
 * `saveApplication` now runs — `updateMany({ where: { id, version }, data: { version:+1 }})` —
 * to prove the audit-trail-corruption race is closed:
 *   two writers both load version V; the first save bumps V→V+1 (count 1);
 *   the second save (still expecting V) matches no row (count 0) → ConcurrencyError.
 * (The repo's saveApplication imports `server-only`, unrunnable under tsx; this exercises
 *  the identical DB-level guard. Restores the original version afterwards.)
 *
 * Run from apps/web-app:
 *   set -a; . .env.local; set +a; pnpm exec tsx scripts/spike-concurrency.ts
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

const { prisma } = await import('../src/server/db')

async function guardedBump(id: string, expectedVersion: number): Promise<boolean> {
  const res = await prisma.application.updateMany({
    where: { id, version: expectedVersion },
    data: { version: { increment: 1 } },
  })
  return res.count === 1
}

async function main() {
  const app = await prisma.application.findFirst({ select: { id: true, version: true } })
  if (!app) throw new Error('No seeded application.')
  const { id } = app
  const loadedVersion = app.version // both "writers" load this same version

  const firstOk = await guardedBump(id, loadedVersion) // writer A saves first
  const secondOk = await guardedBump(id, loadedVersion) // writer B, stale version

  const after = await prisma.application.findUnique({ where: { id }, select: { version: true } })
  const ok = firstOk === true && secondOk === false && after?.version === loadedVersion + 1

  console.log({ id, loadedVersion, firstWriter: firstOk, secondWriter_rejected: !secondOk, versionAfter: after?.version, ok })

  // restore so the spike leaves no trace
  await prisma.application.update({ where: { id }, data: { version: loadedVersion } })
  await prisma.$disconnect()

  if (!ok) {
    console.error('❌ optimistic guard did NOT behave correctly')
    process.exit(1)
  }
  console.log('✅ optimistic lock OK — stale concurrent save rejected, version advanced exactly once')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
