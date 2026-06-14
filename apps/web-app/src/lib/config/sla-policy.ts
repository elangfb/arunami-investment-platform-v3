import type { Stage } from '../types'
import { DESKS, type Desk } from '../desks'

// Pure validation for an admin-submitted SLA target map (Master tab → createSlaPolicyVersion).
// Compliance-config discipline: reject anything that isn't a complete, sane per-stage map before
// it can become a new version row. Bounds keep an admin typo (0, negative, 9999) out of the
// SLA clock that drives at_risk/overdue alerts.

export const STAGES: readonly Stage[] = [1, 2, 3, 4, 5, 6]
const MIN_DAYS = 1
const MAX_DAYS = 365

/** Parse + validate a raw target map into a complete Stage→days record, or throw (Bahasa). */
export function parseSlaTargets(raw: Record<string | number, unknown>): Record<Stage, number> {
  const out = {} as Record<Stage, number>
  for (const s of STAGES) {
    const v = Number(raw?.[s] ?? raw?.[String(s)])
    if (!Number.isInteger(v) || v < MIN_DAYS || v > MAX_DAYS) {
      throw new Error(`Target SLA tahap ${s} harus bilangan bulat ${MIN_DAYS}–${MAX_DAYS} hari.`)
    }
    out[s] = v
  }
  return out
}

const DESK_SET = new Set<string>(DESKS)

/**
 * Parse + validate an admin-submitted PARTIAL per-desk SLA map (business days / HK). Per-desk
 * targets are ADDITIVE over the per-stage model: a desk without an entry has no per-desk SLA and
 * falls back to the stage clock (so an empty map = today's behavior). Rejects unknown desk ids and
 * out-of-range values (same 1–365 bounds as the per-stage targets). Returns a partial Desk→HK map.
 * Exact per-desk values are W1 — this only guarantees a sane shape once they're configured.
 */
export function parseDeskSlaTargets(raw: Record<string, unknown>): Partial<Record<Desk, number>> {
  const out: Partial<Record<Desk, number>> = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!DESK_SET.has(key)) throw new Error(`Desk SLA tidak dikenal: "${key}".`)
    const v = Number(value)
    if (!Number.isInteger(v) || v < MIN_DAYS || v > MAX_DAYS) {
      throw new Error(`Target SLA desk ${key} harus bilangan bulat ${MIN_DAYS}–${MAX_DAYS} hari kerja.`)
    }
    out[key as Desk] = v
  }
  return out
}
