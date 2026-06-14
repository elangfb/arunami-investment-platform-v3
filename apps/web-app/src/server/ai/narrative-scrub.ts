// Pure, dependency-free guard for AI-drafted narrative fields. Kept SEPARATE from
// narrative.ts (which imports the DB-backed audit trail via `./audit` → `@/server/db`)
// so these scrub invariants can be unit-tested hermetically without a DATABASE_URL.
// scrubNarrative is the second line of defence after the system instruction + schema:
// it drops any field that still states a decision verdict or a risk-level rating.

export type DocKind = 'muap' | 'rsk'

const VERDICT_RE =
  /\b(disetujui|ditolak|disetujui dengan syarat|tidak memenuhi|memenuhi syarat|layak (?:untuk )?dibiayai|tidak layak (?:untuk )?dibiayai|direkomendasikan (?:untuk )?(?:disetujui|ditolak|menyetujui|menolak))\b/i
// English level words are a strong signal of a copied matrix verdict.
const EN_LEVEL_RE = /\b(low|moderate|high)\b/i
// Indonesian level words only count when framed as a risk level/rating/category.
const ID_LEVEL_NEAR_RISK_RE =
  /(?:risiko|level|rating|kategori)[^.]{0,30}\b(?:tinggi|sedang|rendah)\b|\b(?:tinggi|sedang|rendah)\b[^.]{0,20}risiko/i
// A grading construction ("tergolong/dinilai/dikategorikan … tinggi", "berada pada level
// rendah") is a risk-rating verdict regardless of distance from the word "risiko" — caught
// even in a long sentence that the proximity window above misses. The verb anchor avoids
// false positives on incidental level words ("permintaan pasar tinggi": no grading verb).
const ID_LEVEL_GRADED_RE =
  /\b(?:tergolong|dinilai|dikategorikan|dikategorisasi(?:kan)?|digolongkan|berada (?:di|pada)(?: level)?|pada level)\s+(?:risiko\s+)?(?:tinggi|sedang|rendah)\b/i

export interface ScrubResult {
  fields: Record<string, string>
  violations: string[]
}

export function scrubNarrative(fields: Record<string, string>, docKind: DocKind): ScrubResult {
  const out: Record<string, string> = {}
  const violations: string[] = []
  for (const [k, raw] of Object.entries(fields)) {
    const v = typeof raw === 'string' ? raw.trim() : ''
    if (!v) {
      violations.push(`${k}: empty`)
      continue
    }
    if (VERDICT_RE.test(v)) {
      violations.push(`${k}: verdict`)
      continue
    }
    if (docKind === 'rsk' && (EN_LEVEL_RE.test(v) || ID_LEVEL_NEAR_RISK_RE.test(v) || ID_LEVEL_GRADED_RE.test(v))) {
      violations.push(`${k}: risk-level`)
      continue
    }
    out[k] = v
  }
  return { fields: out, violations }
}
