// Derive 5C+1S aspect scores from a Doc-extracted ExtractedSnapshot.
//
// The RSK risk matrix is 5C+2S: it splits Sharia into Compliance + Structuring.
// The app's scoring model (scoring.ts) is 5C+1S. We fold the two sharia
// dimensions into the single `syariah` key, worst-wins (the riskier of the two
// drives the score), and map the risk officer's explicit level per aspect to a
// score band aligned with aspectStatus() thresholds (≥80 pass / 60–79 warn / <60 weak):
//   low → 90 (pass), medium → 70 (warn), high → 45 (weak)
//
// Pure: no app/DB deps. The decision to PREFER these over the synthetic
// generateAspectScores() (when a doc has been extracted) lives at the call site.

import type { AspectScores, FiveCSKey } from './scoring'
import type { ExtractedSnapshot, MatrixAspect, RiskLevel } from './extraction/types'

export const LEVEL_SCORE: Record<RiskLevel, number> = {
  low: 90,
  medium: 70,
  high: 45,
}

// Which matrix aspect(s) feed each 5C+1S scoring key. Sharia folds two → one.
const ASPECT_SOURCES: Record<FiveCSKey, MatrixAspect[]> = {
  character: ['character'],
  capacity: ['capacity'],
  capital: ['capital'],
  condition: ['condition'],
  collateral: ['collateral'],
  syariah: ['sharia_compliance', 'sharia_structuring'],
}

// True when the snapshot carries at least one assessed matrix level — i.e. the
// extracted data is rich enough to score from (vs. falling back to synthetic).
export function hasMatrixSignal(snapshot: ExtractedSnapshot): boolean {
  return snapshot.matrix.some((row) => row.level != null)
}

// Map an ExtractedSnapshot to AspectScores. Only keys whose source level(s) were
// extracted are included; totalScore() already weights over present aspects.
export function scoresFromSnapshot(snapshot: ExtractedSnapshot): AspectScores {
  const levelByAspect = new Map<MatrixAspect, RiskLevel | null>(
    snapshot.matrix.map((row) => [row.aspect, row.level]),
  )

  const scores: AspectScores = {}
  for (const key of Object.keys(ASPECT_SOURCES) as FiveCSKey[]) {
    const sourceScores: number[] = []
    for (const aspect of ASPECT_SOURCES[key]) {
      const level = levelByAspect.get(aspect)
      if (level != null) sourceScores.push(LEVEL_SCORE[level])
    }
    // worst-wins: the riskier dimension (lowest score) governs.
    if (sourceScores.length) scores[key] = Math.min(...sourceScores)
  }
  return scores
}
