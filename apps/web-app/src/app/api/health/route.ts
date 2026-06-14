import { prisma } from '@/server/db'
import { dataBackend } from '@/server/repo/backend'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { log, errField } from '@/server/log'

// GET /api/health — liveness/readiness probe for compose, Caddy, and ops monitoring.
// Unauthenticated by design (it leaks no data); checks the critical dependency (the data backend).
// 200 {status:'ok'} when reachable, 503 {status:'degraded'} otherwise. Backend-aware: pings Firestore
// (a 1-doc read) under DATA_BACKEND=firestore, else Postgres (SELECT 1) — so the probe tracks whichever
// backend is actually serving requests.
export const dynamic = 'force-dynamic' // never cache a health check

async function pingBackend(): Promise<void> {
  if (dataBackend() === 'firestore') {
    await getDb().collection(COL.applications).limit(1).get()
  } else {
    await prisma.$queryRaw`SELECT 1`
  }
}

export async function GET() {
  try {
    await pingBackend()
    return Response.json({ status: 'ok', db: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    log.error('health.db_unreachable', errField(e))
    return Response.json({ status: 'degraded', db: false }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
