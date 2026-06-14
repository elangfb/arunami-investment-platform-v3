// Structured JSON logger → stdout/stderr. Zero-dependency on purpose: nothing to trace
// through the standalone build, and the whole surface is one `Logger` interface so it can be
// swapped for pino (or fanned out to a Sentry/GlitchTip transport) later without touching
// call sites. One JSON object per line is what container log collectors (Loki/CloudWatch/…)
// expect. Info/debug → stdout, warn/error → stderr, so ops can split signal from noise.
//
// COMPLIANCE: never pass PII (names, NIK, account numbers) as log fields. Log ids
// (applicationId, userId, docId) and outcomes — not the data being processed. The Gemini
// PII-masking guarantee (lib/pii-mask.ts) covers prompts, NOT logs; logging is a separate path.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
export type Level = keyof typeof LEVELS

// LOG_LEVEL gates output; LOG_SILENT mutes entirely (tests set it). Default: info.
const threshold = (): number => {
  if (process.env.LOG_SILENT === '1') return Infinity
  const lvl = (process.env.LOG_LEVEL as Level | undefined) ?? 'info'
  return LEVELS[lvl] ?? LEVELS.info
}

export type Fields = Record<string, unknown>

export interface Logger {
  debug(msg: string, fields?: Fields): void
  info(msg: string, fields?: Fields): void
  warn(msg: string, fields?: Fields): void
  error(msg: string, fields?: Fields): void
  /** Derive a logger that stamps `bindings` onto every line (e.g. requestId, route). */
  child(bindings: Fields): Logger
}

// Normalize an Error into a serializable field (message + name; stack only at debug level).
export function errField(e: unknown): Fields {
  if (e instanceof Error) {
    const out: Fields = { errName: e.name, errMsg: e.message }
    if (threshold() <= LEVELS.debug && e.stack) out.errStack = e.stack
    return out
  }
  return { errMsg: String(e) }
}

// ── PII-scrubbed error fields ────────────────────────────────────────────────
// Google Drive sharing errors echo the sharee's EMAIL in e.message (e.g. "Invalid sharing
// request: x@y.com"), and `errField` would serialize it straight into the log line. Catch
// paths that touch sharing/permissions MUST use `errFieldScrubbed` instead: it keeps the
// diagnostic signal (HTTP status + Google error reason) and redacts email-shaped substrings.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g

/** Redact email-shaped substrings from free text ("[email]"). */
export function scrubEmails(s: string): string {
  return s.replace(EMAIL_RE, '[email]')
}

// Best-effort HTTP status off the assorted SDK error shapes (gaxios/googleapis: `.code` or
// `.response.status`; @google/genai: `.status`). Duplicated from server/retry.ts's private
// statusOf because retry.ts imports this module (no cycle allowed).
function httpStatusOf(e: unknown): number | undefined {
  const any = e as { status?: unknown; code?: unknown; response?: { status?: unknown } }
  for (const v of [any?.status, any?.response?.status, any?.code]) {
    if (typeof v === 'number') return v
  }
  return undefined
}

/** Like `errField` but PII-safe for Drive/sharing errors: HTTP status + Google reason +
 *  an email-redacted message. Use in every catch that may carry a sharee email. */
export function errFieldScrubbed(e: unknown): Fields {
  const out: Fields = {}
  const status = httpStatusOf(e)
  if (status !== undefined) out.errStatus = status
  const any = e as {
    errors?: { reason?: string }[]
    response?: { data?: { error?: { errors?: { reason?: string }[] } } }
  }
  const reason = any?.errors?.[0]?.reason ?? any?.response?.data?.error?.errors?.[0]?.reason
  if (reason) out.errReason = reason
  if (e instanceof Error) {
    out.errName = e.name
    out.errMsg = scrubEmails(e.message)
    if (threshold() <= LEVELS.debug && e.stack) out.errStack = scrubEmails(e.stack)
  } else {
    out.errMsg = scrubEmails(String(e))
  }
  return out
}

function emit(level: Level, bindings: Fields, msg: string, fields?: Fields): void {
  if (LEVELS[level] < threshold()) return
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...bindings, ...fields })
  if (level === 'warn' || level === 'error') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

function make(bindings: Fields): Logger {
  return {
    debug: (msg, fields) => emit('debug', bindings, msg, fields),
    info: (msg, fields) => emit('info', bindings, msg, fields),
    warn: (msg, fields) => emit('warn', bindings, msg, fields),
    error: (msg, fields) => emit('error', bindings, msg, fields),
    child: (extra) => make({ ...bindings, ...extra }),
  }
}

export const log: Logger = make({})
