import type { LoanApplication } from './types'

// 5C+1S quantified scoring (V1). Mirrors FOS's Settings → Scoring model:
// weighted aspects out of 100, thresholds ≥80 / 60–79 / <60.
// Deterministic + DATA-AWARE: the objective aspects are tied to the real hard
// gates (Capacity↔DSR, Collateral↔LTV, Character↔Kol) so the score moves with
// the application's actual risk, not random noise. Not a real LLM — prototype.

export type FiveCSKey =
  | 'character'
  | 'capacity'
  | 'capital'
  | 'condition'
  | 'collateral'
  | 'syariah'

// FOS Settings → Scoring weights. Sum = 100.
export const ASPECT_WEIGHTS: Record<FiveCSKey, number> = {
  character: 20,
  capacity: 20,
  capital: 15,
  condition: 15,
  collateral: 15,
  syariah: 15,
}

export const ASPECT_ORDER: FiveCSKey[] = [
  'character',
  'capacity',
  'capital',
  'condition',
  'collateral',
  'syariah',
]

export const ASPECT_LABEL: Record<FiveCSKey, string> = {
  character: 'Karakter',
  capacity: 'Kapasitas',
  capital: 'Modal',
  condition: 'Kondisi',
  collateral: 'Agunan',
  syariah: 'Syariah',
}

export type AspectStatus = 'pass' | 'warn' | 'weak'
export function aspectStatus(score: number): AspectStatus {
  if (score >= 80) return 'pass'
  if (score >= 60) return 'warn'
  return 'weak'
}

export type Recommendation = 'approve' | 'conditional' | 'reject'
export function recommendationFromTotal(total: number): Recommendation {
  if (total >= 80) return 'approve'
  if (total >= 60) return 'conditional'
  return 'reject'
}
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  approve: 'Direkomendasikan',
  conditional: 'Bersyarat',
  reject: 'Tidak Direkomendasikan',
}

export type AspectScores = Partial<Record<FiveCSKey, number>>

// Weighted total out of 100 (only over the aspects that have a score).
export function totalScore(scores: AspectScores): number {
  let sum = 0
  let wsum = 0
  for (const k of ASPECT_ORDER) {
    const s = scores[k]
    if (typeof s === 'number') {
      sum += s * ASPECT_WEIGHTS[k]
      wsum += ASPECT_WEIGHTS[k]
    }
  }
  return wsum ? Math.round(sum / wsum) : 0
}

const clamp = (n: number, lo = 42, hi = 96) => Math.max(lo, Math.min(hi, Math.round(n)))

// Tiny deterministic jitter from the application id → stable scores per app.
function seed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

export function generateAspectScores(app: LoanApplication): Record<FiveCSKey, number> {
  const { dsr, ltv, kol } = app.hardGates
  const j = seed(app.id)
  const jit = (shift: number, spread = 8) => ((j >> shift) % (spread + 1)) - spread / 2
  return {
    // Character ← Kolektibilitas (SLIK): a flagged Kol drags the score down.
    character: clamp((app.kolEntered && kol > 1 ? 56 : 87) + jit(2, 6)),
    // Capacity ← DSR: lower DSR → higher capacity.
    capacity: app.financialsAssessed ? clamp(100 - (dsr - 15) * 1.4) : clamp(72 + jit(4)),
    capital: clamp(80 + jit(6)),
    condition: clamp(78 + jit(8)),
    // Collateral ← LTV: lower LTV → higher collateral comfort.
    collateral: app.financialsAssessed ? clamp(100 - (ltv - 30) * 1.0) : clamp(75 + jit(10)),
    // Syariah compliance: typically clean for screened akad.
    syariah: clamp(90 + jit(12, 6)),
  }
}
