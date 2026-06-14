// Pure customer-dedup resolver (ADR-0020 §2; design Topic 2). On create-time, given a new
// nasabah's identity, surface existing Customer rows that share the identity key so the UI can
// offer a SOFT NUDGE ("Nasabah ini sudah terdaftar — buka filenya?"). NEVER a hard block — the
// resolver only returns matches; the caller decides whether to nudge or proceed.
//
// Identity key (per ADR-0020): individual → exact NIK; business → exact NPWP, NIB secondary.
// Identity strings compare as TRIMMED STRINGS, never Number(): a 16-digit NIK exceeds 2^53
// (9,007,199,254,740,992) so two distinct NIKs would round to the same IEEE-754 double and
// falsely match — the same hazard fixed in lib/extraction-registry.ts extractionValuesEqual.

export type CustomerType = 'individual' | 'business'

/** The identity the new nasabah was entered/extracted with. */
export interface DedupQuery {
  type: CustomerType
  nik?: string | null
  npwp?: string | null
  nib?: string | null
}

/** An existing Customer to test for an identity collision (id + the identity fields). */
export interface DedupCandidate {
  id: string
  type: CustomerType
  nik?: string | null
  npwp?: string | null
  nib?: string | null
}

/** Which identity key produced the match (or 'none' when matches is empty). */
export type DedupReason = 'nik' | 'npwp' | 'nib' | 'none'

export interface DedupResult {
  matches: DedupCandidate[]
  reason: DedupReason
}

/** Trimmed-string identity equality (never Number() — see file header). null/empty ≠ equal. */
function idEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  const ta = String(a).trim()
  const tb = String(b).trim()
  if (ta === '' || tb === '') return false
  return ta === tb
}

/**
 * Resolve existing-customer matches for a soft nudge. Pure: same query+candidates → same result.
 * - individual → exact NIK match.
 * - business  → exact NPWP match; if none, NIB secondary.
 * Candidates of the other type are never matched (type isolation). Returns matches[] (possibly
 * empty) + the reason the match key fired. Empty query identity → no matches.
 */
export function resolveCustomerDedup(query: DedupQuery, candidates: DedupCandidate[]): DedupResult {
  const sameType = candidates.filter((c) => c.type === query.type)

  if (query.type === 'individual') {
    const matches = query.nik ? sameType.filter((c) => idEq(c.nik, query.nik)) : []
    return { matches, reason: matches.length > 0 ? 'nik' : 'none' }
  }

  // business — NPWP primary, NIB secondary.
  const byNpwp = query.npwp ? sameType.filter((c) => idEq(c.npwp, query.npwp)) : []
  if (byNpwp.length > 0) return { matches: byNpwp, reason: 'npwp' }

  const byNib = query.nib ? sameType.filter((c) => idEq(c.nib, query.nib)) : []
  if (byNib.length > 0) return { matches: byNib, reason: 'nib' }

  return { matches: [], reason: 'none' }
}
