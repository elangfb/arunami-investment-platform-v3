import type { LoanApplication } from '@/lib/types'

// Swappable web-research provider boundary — mirrors `OCR_PROVIDER` (server/ocr) and
// `INFERENCE_PROVIDER` (server/ai/provider). The engine is an env/credential choice — NOT a
// code change: moving from the deterministic stub → self-hosted SearXNG + Firecrawl is
// `WEB_RESEARCH_PROVIDER=firecrawl` + that provider's config. Add a provider = implement this
// interface and register it in index.ts. The "structured citations + human-confirms-the-AI-
// claim" UX is unchanged downstream, so a hallucinated source never silently becomes credit
// memo content (workflow-finetune.md §7).
//
// COMPLIANCE / EGRESS: this boundary OWNS the egress. Every query/URL passing through it is
// already business-entity-only — person names are stripped by lib/research/classifier.ts
// BEFORE the provider sees them. The provider must never widen that scope.

/** One web-search result before any LLM synthesis. */
export interface SearchResult {
  url: string
  title: string
  snippet: string
  /** Optional provider score for ranking; downstream code does not trust it absolutely. */
  score?: number
}

/** A fetched page's cleaned extract (markdown / plain text). */
export interface FetchedPage {
  url: string
  title: string
  /** Cleaned plain text or markdown — extractor's choice. */
  text: string
  fetchedAt: string // ISO
}

export interface WebResearchProvider {
  readonly name: string
  /** Run a search query against the engine; return ranked results. Never throws fatally —
   *  a failure returns an empty array so callers can fall back / surface "no results". */
  search(query: string): Promise<SearchResult[]>
  /** Fetch + clean a single URL. Returns null on failure (best-effort; pipeline continues). */
  fetch(url: string): Promise<FetchedPage | null>
}

/** Context the pipeline hands the classifier when building queries. Trimmed to what's actually
 *  needed so we never accidentally pass [NASABAH]-class PII through the call chain. */
export interface ResearchContext {
  namaUsaha: string | null
  nasabahType: LoanApplication['nasabahType']
  akadType: LoanApplication['akadType']
  purpose: string
  collateralType: LoanApplication['collateralType']
}
