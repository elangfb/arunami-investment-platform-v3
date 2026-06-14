// Deterministic document-discovery matcher — PURE, no IO, no content reading.
//
// INVARIANT (design §3, non-negotiable): "Discovery never reads content." Matching is a
// case-insensitive name test of admin-editable query aliases against a file's FULL PATH
// (so a match may come from the folder name OR the filename). We NEVER read bytes, run
// OCR, or peek at file content here — `DiscoveredFile` carries path strings only.
//
// Matching is WORD-BOUNDARY substring (not raw substring): an alias matches only when it
// appears flanked by separators or the start/end of the path — never mid-token. This is a
// refinement of the design's "case-insensitive substring" that prevents short abbreviations
// from matching inside unrelated words (e.g. `IMB` must not match `Timbangan`, `KK` must not
// match `OKK`) — a false-positive silently marks a requirement satisfied, which is worse than
// a ⬜ miss the RM resolves by renaming. Smushed names with no separator (e.g. `scanKTP.pdf`)
// fall through to that same RM-renames path. Boundaries = anything that is not [a-z0-9].
//
// Matching is MANY-TO-MANY: one file satisfies EVERY checklist item whose alias matches
// (e.g. `KTP & NPWP Pengurus.pdf` satisfies both ktp and npwp). Files are never split or
// deduplicated across items.
//
// LONGEST-ALIAS-WINS PER PATH: a more-specific alias suppresses a more-general one when they
// overlap on the SAME span of the path. `KTP Pengurus.pdf` must satisfy only `ktp_pengurus`,
// NOT also the bare `ktp` (principal KTP) — otherwise a single pengurus file silently marks the
// principal-identity requirement present (a false ✅, worse than a ⬜ miss). The suppression is
// POSITIONAL: a match is dropped only when EVERY occurrence of its alias sits strictly inside a
// longer competing alias's span. A standalone occurrence elsewhere keeps the match alive — so
// `KTP dan KTP Pengurus.pdf` (a file genuinely holding both) still satisfies `ktp` AND
// `ktp_pengurus`.
//
// Reconciliation yields 3 states (design §3): ✅ satisfied · ⬜ missing ·
// ⚠️ present-but-unrecognized (the RM's fix bucket = files that match ZERO items).

import { DEFAULT_DOC_ALIASES } from './aliases'

/** A file surfaced by discovery. Path strings ONLY — never content. */
export interface DiscoveredFile {
  /** Full path relative to the discovered folder root (folder segments + filename). */
  path: string
  /** Optional content-addressed identity from the manifest ledger (design §3). */
  fileId?: string
  sha256?: string
}

/** One checklist row: the docType to satisfy + its substring query aliases. */
export interface ChecklistItem {
  docType: string
  aliases: string[]
}

export type DocMatchState = 'satisfied' | 'missing'

export interface DocMatch {
  docType: string
  state: DocMatchState
  /** Every file path that matched this item, in discovery order. */
  matchedPaths: string[]
}

export interface ReconciliationResult {
  matches: DocMatch[]
  /** ⚠️ bucket: paths of files that matched ZERO items (present-but-unrecognized). */
  unrecognized: string[]
}

/** A boundary char is anything that is NOT an alphanumeric (separators, punctuation, start/end). */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[a-z0-9]/.test(ch)
}

/** A half-open `[start, end)` span where an alias matched the path. */
type Span = readonly [number, number]

/**
 * Every word-boundary occurrence span of any non-empty alias of `aliases` within `haystack`
 * (lowercased). A span is recorded only when the match is flanked by boundaries on BOTH sides —
 * i.e. the alias appears as a whole token/phrase, never mid-word.
 */
function matchSpans(haystack: string, aliases: string[]): Span[] {
  const spans: Span[] = []
  for (const alias of aliases) {
    const needle = alias.trim().toLowerCase()
    if (needle.length === 0) continue // ignore blank/whitespace aliases (would match all)
    let from = 0
    for (;;) {
      const idx = haystack.indexOf(needle, from)
      if (idx === -1) break
      const before = idx === 0 ? undefined : haystack[idx - 1]
      const after = idx + needle.length >= haystack.length ? undefined : haystack[idx + needle.length]
      if (isBoundary(before) && isBoundary(after)) spans.push([idx, idx + needle.length])
      from = idx + 1 // overlapping search — a later occurrence may sit at a boundary
    }
  }
  return spans
}

/** True iff span `inner` is strictly contained within the longer span `outer`. */
function isStrictlyInside(inner: Span, outer: Span): boolean {
  return outer[0] <= inner[0] && inner[1] <= outer[1] && outer[1] - outer[0] > inner[1] - inner[0]
}

/**
 * The docTypes a single file satisfies — EVERY item whose alias matches the file's full path at a
 * word boundary, MINUS items whose every match is positionally subsumed by a longer competing
 * alias (longest-alias-wins per path; see the header note). Pure; reads only `file.path`.
 */
export function matchFileToItems(file: DiscoveredFile, items: ChecklistItem[]): string[] {
  const haystack = file.path.toLowerCase()
  const spansByItem = items.map((item) => matchSpans(haystack, item.aliases))

  const satisfied: string[] = []
  for (let i = 0; i < items.length; i++) {
    const spans = spansByItem[i]
    if (spans.length === 0) continue
    // Drop this match iff EVERY one of its spans sits strictly inside a longer span from a
    // DIFFERENT item (e.g. bare `ktp`'s "KTP" entirely within `ktp_pengurus`'s "KTP Pengurus").
    const subsumed = spans.every((span) =>
      spansByItem.some((other, j) => j !== i && other.some((o) => isStrictlyInside(span, o))),
    )
    if (!subsumed) satisfied.push(items[i].docType)
  }
  return satisfied
}

/**
 * Reconcile a set of discovered files against a checklist.
 *
 * - Each item is `satisfied` iff ≥1 file matches it, else `missing`; a satisfied item
 *   lists ALL its matched paths (in discovery order).
 * - `unrecognized` collects files that matched ZERO items (the ⚠️ fix bucket).
 */
export function reconcileDiscovery(
  files: DiscoveredFile[],
  items: ChecklistItem[],
): ReconciliationResult {
  const matchedPathsByDocType = new Map<string, string[]>()
  for (const item of items) matchedPathsByDocType.set(item.docType, [])

  const unrecognized: string[] = []

  for (const file of files) {
    const docTypes = matchFileToItems(file, items)
    if (docTypes.length === 0) {
      unrecognized.push(file.path)
      continue
    }
    for (const docType of docTypes) {
      matchedPathsByDocType.get(docType)!.push(file.path)
    }
  }

  const matches: DocMatch[] = items.map((item) => {
    const matchedPaths = matchedPathsByDocType.get(item.docType)!
    return {
      docType: item.docType,
      state: matchedPaths.length > 0 ? 'satisfied' : 'missing',
      matchedPaths,
    }
  })

  return { matches, unrecognized }
}

/**
 * Build ChecklistItem[] for a list of docTypes from the DEFAULT_DOC_ALIASES table.
 * A docType with no alias entry gets an empty alias list (it will never auto-match).
 */
export function itemsFor(docTypes: string[]): ChecklistItem[] {
  return docTypes.map((docType) => ({
    docType,
    aliases: DEFAULT_DOC_ALIASES[docType] ?? [],
  }))
}
