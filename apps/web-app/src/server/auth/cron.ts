import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

// Machine-to-machine auth for scheduled trigger endpoints (e.g. /api/cron/materialize-meetings),
// invoked by Google Cloud Scheduler — NOT by a logged-in user, so the session/desk gating used by
// server actions doesn't apply. Cloud Scheduler is configured to send the shared CRON_SECRET as an
// `Authorization: Bearer <secret>` header (or `X-Cron-Secret: <secret>`).
//
// FAIL-CLOSED: if CRON_SECRET is unset, every request is rejected — a misconfigured deploy can never
// run a trigger unauthenticated. Comparison is constant-time over SHA-256 digests (no length leak).

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** True iff the request carries the shared cron secret. Returns false when CRON_SECRET is unset. */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  const provided = bearer ?? req.headers.get('x-cron-secret')
  if (!provided) return false
  return safeEqual(provided, secret)
}
