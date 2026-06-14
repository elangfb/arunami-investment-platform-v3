// EGRESS CLASSIFIER for web research (workflow-finetune.md §7).
//
// The hard rule: a query that names an INDIVIDUAL (nasabah perorangan), a NIK / phone / email
// / address, or otherwise reveals a private-person identifier MUST NOT egress. Only
// [USAHA]-class business identifiers may go to the open web. ⚠️ "Business research can still
// be PERSONAL data" — sole-proprietor / director names ARE personal under PDP Law, so the
// classifier treats nasabahType='individual' as a hard egress refusal even when the customer
// runs a business, and strips standalone person names from queries regardless.
//
// This is the SINGLE seam every web-research code path must funnel through; provider.ts and
// the pipeline rely on this. Pure → unit-tested.

import type { ResearchContext } from '@/server/research/provider'

/**
 * Decide whether the application is researchable AT ALL and, if so, build the safe queries.
 * Returns `null` when egress is refused (e.g. individual nasabah, missing business name).
 * The first time a query is built per application, the caller records an audit entry so the
 * decision is traceable for OJK review.
 */
export interface ResearchPlan {
  queries: string[]
  /** Human-readable reason for the chosen scope — surfaced in the audit history entry. */
  reason: string
}

const FORBIDDEN_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Structured PII that must never appear in a query, defence-in-depth on top of the
  // upstream masking. Matches the lib/pii-mask.ts FIRST-LAYER patterns.
  [/\b\d{16}\b/, 'NIK'],
  [/\b\d{4}[ .]\d{4}[ .]\d{4}[ .]\d{4}\b/, 'NIK'],
  [/(?:\+?62|0)[ .-]?8[\d .-]{7,13}\d/, 'TELEPON'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i, 'EMAIL'],
  [/\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/, 'NPWP'],
]

/** Strip any structured-PII tail that snuck into a candidate query (defence-in-depth). */
function scrubStructuredPii(q: string): string {
  let out = q
  for (const [re] of FORBIDDEN_PATTERNS) out = out.replace(new RegExp(re.source, re.flags + (re.global ? '' : 'g')), '')
  return out.replace(/\s+/g, ' ').trim()
}

/** True when the query still contains forbidden structured PII after scrubbing — the
 *  pipeline MUST refuse to send these (fail-closed). */
export function detectForbiddenInQuery(q: string): string[] {
  const hits = new Set<string>()
  for (const [re, label] of FORBIDDEN_PATTERNS) if (re.test(q)) hits.add(label)
  return [...hits]
}

/**
 * Build the safe, business-only query set for an application. Refuses egress for individual
 * customers and for any context that wouldn't yield a researchable entity name. Each query
 * focuses on the BUSINESS — name + sector/purpose anchor — never the individual.
 */
export function planResearch(ctx: ResearchContext): ResearchPlan | null {
  // Individuals (perorangan) — even sole proprietors — are PERSONAL data under PDP Law.
  // Refuse egress unconditionally; the human can supply manual research notes.
  if (ctx.nasabahType !== 'business') {
    return null
  }
  const usaha = (ctx.namaUsaha ?? '').trim()
  if (!usaha) return null
  // Strip any accidental PII; if anything forbidden survives, refuse to send.
  const safe = scrubStructuredPii(usaha)
  if (!safe || detectForbiddenInQuery(safe).length) return null

  // Anchor by sector/purpose — short factual queries, NEVER the person name. Quotes around
  // the business name to bind the term; sector words come from purpose to focus the search.
  const purpose = scrubStructuredPii(ctx.purpose ?? '').slice(0, 80)
  // Batch 5 (#1): multi-angle, not company-profile-only. Three angles, all business/sector-scoped:
  //   1. ENTITY — registry/profile lookups bound to the business name.
  //   2. SECTOR — the industry the business operates in (from purpose), to ground market/condition.
  //   3. MACRO — generic industry statistics (no entity name) for sector-level context (BPS/news).
  // Collateral/asset PRICE references are deliberately NOT added here: per the acceptance register
  // rambu they need an allowlist expansion + Bank-Legal review first, so they stay out of the auto path.
  const queries = [
    `"${safe}" perusahaan profil`,
    `"${safe}" akta pendirian Kemenkumham`,
    `"${safe}" SIUP NIB OSS`,
  ]
  if (purpose) {
    queries.push(`"${safe}" ${purpose}`) // entity-in-context
    queries.push(`"${safe}" ${purpose} sektor industri prospek`) // sector, bound to the entity
    queries.push(`${purpose} industri Indonesia statistik pertumbuhan`) // macro — generic, no entity/PII
  }
  return {
    queries: queries.filter((q) => !detectForbiddenInQuery(q).length),
    reason: `multi-angle business research scoped to "${safe}" — entity + sector${purpose ? ' + makro' : ''} (no person-name egress)`,
  }
}

// ── Source allowlist (workflow-finetune.md §7) ────────────────────────────────────────────
// The pipeline only retains results from these domains; everything else is dropped. Keeps
// fetch volume bounded + bias toward authoritative business-registry sources, OJK, IDX,
// reputable news (national press). Add domains conservatively.
const ALLOWED_DOMAINS: ReadonlyArray<RegExp> = [
  /(^|\.)ahu\.go\.id$/i, // AHU/Kemenkumham (akta + SK)
  /(^|\.)kemenkumham\.go\.id$/i,
  /(^|\.)oss\.go\.id$/i, // NIB / SIUP
  /(^|\.)ojk\.go\.id$/i, // OJK
  /(^|\.)idx\.co\.id$/i, // Bursa Efek Indonesia
  /(^|\.)bps\.go\.id$/i, // Statistics
  // Tier-1 Indonesian news (extend conservatively after Bank-Legal review).
  /(^|\.)kompas\.com$/i,
  /(^|\.)tempo\.co$/i,
  /(^|\.)kontan\.co\.id$/i,
  /(^|\.)cnbcindonesia\.com$/i,
  /(^|\.)bisnis\.com$/i,
]

export function isAllowedSource(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return ALLOWED_DOMAINS.some((re) => re.test(host))
  } catch {
    return false
  }
}
