import type { RiskPolicy } from '../hardGates'

// Pure validation for an admin-submitted risk policy (Policy tab → createRiskPolicyVersion).
// Compliance-config discipline: reject anything that isn't a sane set of OJK thresholds before
// it can become a version row. DSR/LTV are percentages (1–100); Kol is the 1–5 kolektibilitas
// scale. Bounds keep an admin typo out of the gate that decides credit approvals.

const PCT_MIN = 1
const PCT_MAX = 100
const KOL_MIN = 1
const KOL_MAX = 5

function intInRange(v: unknown, min: number, max: number, label: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} harus bilangan bulat ${min}–${max}.`)
  }
  return n
}

/** Parse + validate a raw policy input into a clean RiskPolicy, or throw (Bahasa). */
export function parseRiskPolicy(raw: { dsrMaxPct?: unknown; ltvMaxPct?: unknown; kolMax?: unknown }): RiskPolicy {
  return {
    dsrMaxPct: intInRange(raw?.dsrMaxPct, PCT_MIN, PCT_MAX, 'Batas DSR (%)'),
    ltvMaxPct: intInRange(raw?.ltvMaxPct, PCT_MIN, PCT_MAX, 'Batas LTV (%)'),
    kolMax: intInRange(raw?.kolMax, KOL_MIN, KOL_MAX, 'Batas Kolektibilitas'),
  }
}
