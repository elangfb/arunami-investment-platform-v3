// Exponential-backoff retry for transient external-API failures (Gemini quota/overload,
// Google Docs/Drive 429/5xx, flaky network). Only retries errors that are actually transient
// — a 400/401/403/404 fails fast (retrying a bad request just burns quota). Honors a
// Retry-After header when the SDK surfaced one; otherwise exponential backoff + jitter.
//
// Kept separate from rate-limit.ts: that caps inbound abuse, this rides outbound calls.

import { log, errFieldScrubbed } from './log'

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
// Node network-error codes worth a retry (transient connectivity, not config mistakes).
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE'])

// Pull an HTTP status off the assorted shapes the SDKs throw (@google/genai: `.status`;
// gaxios/googleapis: `.code` or `.response.status`). Exported for callers that classify
// failures (e.g. root-share.ts: 4xx-except-429 = permanent, don't re-grant on every login).
export function statusOf(e: unknown): number | undefined {
  const any = e as { status?: unknown; code?: unknown; response?: { status?: unknown } }
  for (const v of [any?.status, any?.response?.status, any?.code]) {
    if (typeof v === 'number') return v
  }
  return undefined
}

export function isRetryable(e: unknown): boolean {
  const status = statusOf(e)
  if (status !== undefined && RETRYABLE_STATUS.has(status)) return true
  const code = (e as { code?: unknown })?.code
  if (typeof code === 'string' && RETRYABLE_CODES.has(code)) return true
  // Some SDKs only encode the condition in the message (e.g. "model is overloaded").
  const msg = e instanceof Error ? e.message : String(e)
  return /\b(429|503|502|504)\b/.test(msg) || /(rate.?limit|quota|overloaded|unavailable|try again)/i.test(msg)
}

// Retry-After may be seconds or an HTTP-date; return ms, or undefined if absent/unparseable.
function retryAfterMs(e: unknown): number | undefined {
  const ra = (e as { response?: { headers?: Record<string, string> } })?.response?.headers?.['retry-after']
  if (!ra) return undefined
  const secs = Number(ra)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const when = Date.parse(ra)
  return Number.isNaN(when) ? undefined : Math.max(0, when - Date.now())
}

export interface RetryOpts {
  retries?: number // extra attempts after the first (default 3 → up to 4 calls)
  baseMs?: number // first backoff step (default 500)
  maxMs?: number // per-delay cap (default 8000)
  label?: string // logged so ops can see which egress is flapping
  sleepFn?: (ms: number) => Promise<void> // injectable for tests
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { retries = 3, baseMs = 500, maxMs = 8000, label = 'egress', sleepFn = realSleep } = opts
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= retries || !isRetryable(e)) throw e
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt)
      const delay = retryAfterMs(e) ?? backoff + Math.floor(Math.random() * (backoff / 2))
      // errFieldScrubbed (not errField): Drive sharing errors echo the sharee email in
      // e.message — the scrubbed shape keeps status/reason and redacts email substrings.
      log.warn('retry.transient', { label, attempt: attempt + 1, delayMs: delay, ...errFieldScrubbed(e) })
      await sleepFn(delay)
    }
  }
}
