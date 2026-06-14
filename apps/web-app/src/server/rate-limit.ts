// In-memory fixed-window rate limiter. Per-process — adequate for the single on-prem
// instance; swap the Map for a shared store (Redis) if Mizan ever runs multi-instance.
// Used to cost-cap / abuse-protect the Gemini-backed AI routes.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export type RateLimitResult = { ok: boolean; retryAfterSec: number }

// Lazy eviction: each key leaves a Bucket behind, so without sweeping, the Map grows
// unbounded over a long-running process (one permanent entry per user×route). Drop
// expired buckets at most once a minute — bounds memory to keys active in the last window.
const SWEEP_INTERVAL_MS = 60_000
let lastSweep = 0
function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, b] of buckets) if (now >= b.resetAt) buckets.delete(key)
}

/**
 * Allow up to `limit` calls per `windowMs` for `key`. `now` is injectable for tests.
 * Returns ok=false (with retryAfterSec) once the window's budget is spent.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  sweepExpired(now)
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  }
  b.count += 1
  return { ok: true, retryAfterSec: 0 }
}

/** Test helper — clear all buckets between tests. */
export function __resetRateLimits(): void {
  buckets.clear()
  lastSweep = 0
}

/** Test/observability helper — number of live buckets currently held. */
export function __bucketCount(): number {
  return buckets.size
}
