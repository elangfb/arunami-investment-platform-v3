import 'server-only'

import { z } from 'zod'
import { planResearch, isAllowedSource } from '@/lib/research/classifier'
import { webResearchProvider } from './index'
import { inferenceProvider } from '@/server/ai/provider'
import { recordAiInteraction } from '@/server/ai/audit'
import { maskForEgress, blockOnResidualPii } from '@/server/ai/redact'
import { loadCascadeForSurface } from '@/server/ai/context-layers'
import { piiSecrets } from '@/lib/pii-mask'
import { getActivePrompt } from '@/server/config/ai-prompts'
import { log, errField } from '@/server/log'
import type { LoanApplication } from '@/lib/types'
import type { ResearchContext, FetchedPage, SearchResult } from './provider'

// Deterministic web-research pipeline (workflow-finetune.md §7):
//   plan (classifier) → search (provider, business-only queries) → fetch (allowlisted URLs)
//   → synthesize (LLM, STRUCTURED citations enforced) → drop hallucinated URLs → return.
// NO agent framework, no tool-calling loop. Each step is a pure-ish function the auditor can
// re-run; the LLM is confined to the synthesize step + bound by a Zod schema that lists URLs
// from the input corpus only. A hallucinated URL is dropped post-hoc as a second line of
// defence (failure-mode discipline matters here: OJK auditability over model freedom).

export interface ExploredSource {
  url: string
  title: string
  /** AI-synthesized claim grounded in the fetched page content. */
  claim: string
  retrievedAt: string // ISO
}

/** Schema the synthesizer must emit. Each `url` MUST come from the input corpus; we verify
 *  post-hoc and DROP any URL not in the set (model can't introduce sources). */
const SynthesisSchema = z.object({
  sources: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string().min(1).max(200),
        claim: z.string().min(20).max(500),
      }),
    )
    .max(8),
})

const MAX_RESULTS_PER_QUERY = 4
const MAX_FETCHES_TOTAL = 6

// `maskedCascade` is the customer-only layered AI context (design §5), ALREADY masked with REAL
// piiSecrets by the caller (research egresses to the public internet — customer "Catatan" PII must
// be masked, but the corpus itself stays masked with [] so namaUsaha, the intended search subject,
// is preserved). Appended at the END as reference framing; the task instruction stays last.
function buildCorpusPrompt(queries: string[], pages: FetchedPage[], maskedCascade = ''): string {
  const lines: string[] = []
  lines.push('KUERI yang dijalankan:')
  queries.forEach((q, i) => lines.push(`${i + 1}. ${q}`))
  lines.push('')
  lines.push('KORPUS hasil (URL → judul → cuplikan teks halaman):')
  pages.forEach((p, i) => {
    lines.push(`---`)
    lines.push(`[${i + 1}] ${p.url}`)
    lines.push(`Judul: ${p.title}`)
    // Cap each page so the prompt stays bounded — most authoritative sources have short pages.
    lines.push(p.text.slice(0, 2000))
  })
  if (maskedCascade.trim()) {
    lines.push('')
    lines.push(maskedCascade.trim())
  }
  lines.push('')
  lines.push('Tugas: rangkum FAKTA BISNIS sebagai daftar pendek `sources`, masing-masing dengan url (dari KORPUS), title, dan claim 1–3 kalimat. DILARANG mengarang URL.')
  return lines.join('\n')
}

/// Run a research pass for one application context. Best-effort: returns an empty array on
/// classifier refusal (individual nasabah / missing business name / structured PII) or on any
/// provider failure. Never throws on the caller's path.
export async function runWebResearch(opts: {
  appId: string
  userId: string
  ctx: ResearchContext
  // P4-A (design §5): the full app, so the pipeline can load + REAL-mask the customer-only layered
  // context (the 'research' surface gets customer-only — derived/app are noise/leak for external
  // fetch). Optional for back-compat: absent → no cascade injected (callers without an app handle).
  app?: LoanApplication
}): Promise<ExploredSource[]> {
  // 1. PLAN — egress classifier owns the refusal decision + the safe queries.
  const plan = planResearch(opts.ctx)
  if (!plan) {
    log.info('research.refused', { appId: opts.appId, reason: 'classifier_refused_egress' })
    return []
  }

  // 2. SEARCH — run every query, dedupe by URL, drop disallowed domains, cap.
  const provider = await webResearchProvider()
  const seen = new Set<string>()
  const ranked: SearchResult[] = []
  for (const q of plan.queries) {
    let results: SearchResult[] = []
    try {
      results = await provider.search(q)
    } catch (e) {
      log.warn('research.search_failed', { appId: opts.appId, ...errField(e) })
      continue
    }
    for (const r of results.slice(0, MAX_RESULTS_PER_QUERY)) {
      if (seen.has(r.url) || !isAllowedSource(r.url)) continue
      seen.add(r.url)
      ranked.push(r)
    }
  }
  if (!ranked.length) return []

  // 3. FETCH — pull up to MAX_FETCHES_TOTAL pages, skip nulls. Allowlist re-checked.
  const pages: FetchedPage[] = []
  for (const r of ranked.slice(0, MAX_FETCHES_TOTAL)) {
    if (!isAllowedSource(r.url)) continue
    try {
      const page = await provider.fetch(r.url)
      if (page) pages.push(page)
    } catch (e) {
      log.warn('research.fetch_failed', { appId: opts.appId, url: r.url, ...errField(e) })
    }
  }
  if (!pages.length) return []

  // 4. SYNTHESIZE — LLM call with a structured citations schema. System prompt is
  // admin-configurable. Egress here = the page contents: queries are already business-only
  // (classifier), but a fetched page may carry stray structured PII (NIK/phone/email/NPWP),
  // so mask the corpus before it leaves Bank infra — same seam as every other AI egress.
  // [] secrets = generic regex sweep only (ResearchContext intentionally omits the person
  // name, and namaUsaha is the intended-egress search subject). Residual handling is fail-OPEN
  // by default (log only); PII_RESIDUAL_BLOCK=1 drops the pass instead (never throws either way).
  const ai = inferenceProvider()
  const systemInstruction = await getActivePrompt('research_synthesis')
  // Customer-only layered context (design §5). CRITICAL: research egresses to the PUBLIC INTERNET, so
  // mask the cascade with REAL piiSecrets (contextMd may carry the nasabah name) — separately from the
  // corpus, which stays []-masked so namaUsaha (the intended search subject) is preserved. The policy
  // (lib/ai-context-policy.ts research → customer-only) drops derived + app for external fetch.
  let maskedCascade = ''
  if (opts.app) {
    const rawCascade = await loadCascadeForSurface(opts.app, 'research').catch(() => '')
    if (rawCascade) maskedCascade = maskForEgress(rawCascade, piiSecrets(opts.app)).masked
  }
  const { masked: corpusPrompt, residual } = maskForEgress(buildCorpusPrompt(plan.queries, pages, maskedCascade), [])
  if (residual.length) {
    const block = blockOnResidualPii()
    log.warn('pii.residual_detected', { surface: 'research', appId: opts.appId, phase: 'synthesis', types: residual, blocked: block })
    if (block) return []
  }
  let raw: z.infer<typeof SynthesisSchema>
  try {
    raw = await ai.generateStructured(systemInstruction, corpusPrompt, SynthesisSchema, { temperature: 0.2 })
  } catch (e) {
    log.warn('research.synthesis_failed', { appId: opts.appId, ...errField(e) })
    return []
  }

  // 5. CITATION ENFORCEMENT — drop any source whose URL wasn't in the input corpus (model
  // can't introduce a citation), and apply the allowlist once more as belt-and-braces.
  const inputUrls = new Set(pages.map((p) => p.url))
  const retrievedAt = new Date().toISOString()
  const explored: ExploredSource[] = raw.sources
    .filter((s) => inputUrls.has(s.url) && isAllowedSource(s.url))
    .map((s) => ({ url: s.url, title: s.title, claim: s.claim, retrievedAt }))

  // 6. AUDIT — store the queries + the model's structured output (post-scrub) as a single
  // audited row; researchers/auditors can trace the trail. surface='research'.
  try {
    await recordAiInteraction({
      appId: opts.appId,
      userId: opts.userId,
      surface: 'research',
      maskedPrompt: corpusPrompt,
      maskedReply: JSON.stringify(explored),
      model: ai.model(),
    })
  } catch (e) {
    log.warn('research.audit_failed', { appId: opts.appId, ...errField(e) })
  }

  return explored
}
