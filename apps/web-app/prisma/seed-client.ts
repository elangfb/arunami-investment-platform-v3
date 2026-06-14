// Shared Prisma client for the seed entrypoints. Loads .env.local (if present — absent in the
// prod container, where DATABASE_URL comes from the compose env_file), then constructs the
// pg-adapter client. Imported by seed.ts (dev: config+dummy) and the --config-only prod path.
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Prisma as PrismaT } from '@prisma/client'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { PrismaClient, Prisma } = await import('@prisma/client')
const { PrismaPg } = await import('@prisma/adapter-pg')

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
export { Prisma }

// Named interfaces (HardGates, FiveCSAnalysis) lack the implicit index signature Prisma's
// InputJsonValue requires; cast them through this at the write boundary.
export const json = (v: unknown) => v as PrismaT.InputJsonValue
