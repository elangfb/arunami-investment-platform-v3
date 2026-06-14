import { createRequire } from 'node:module'
import type { PrismaClient } from '@prisma/client'

// LAZY Prisma singleton. Importing this module must NOT connect, require DATABASE_URL, or even load
// @prisma/client — so the Firestore backend (DATA_BACKEND=firestore) can run with Postgres absent
// (and so a future Prisma-removal is a localized change). The real client is built on the FIRST
// property access via a Proxy; the @prisma/client value import is deferred into makeClient() with
// createRequire (CJS interop under ESM/tsx). Singleton across Next dev hot-reloads via globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
const require = createRequire(import.meta.url)

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg') as typeof import('@prisma/adapter-pg')
  const c = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      // Fail fast if Postgres is unreachable instead of hanging the request forever
      // (pg's default connectionTimeoutMillis = 0 = wait indefinitely → a DB blip would
      // pile up hung requests rather than surfacing a clean 500 + the health probe flipping).
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS) || 10_000,
      // Pool ceiling — tune per deployment (pg default = 10). Keep ≤ Postgres max_connections.
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
    }),
  })
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = c
  return c
}

function client(): PrismaClient {
  return globalForPrisma.prisma ?? makeClient()
}

// Lazy Proxy: the first real access (prisma.application, prisma.$transaction, …) builds/reuses the
// client. Methods are bound to the real client so `this` is correct.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const c = client()
    const value = Reflect.get(c as object, prop, receiver)
    return typeof value === 'function' ? value.bind(c) : value
  },
})
