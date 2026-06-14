import 'server-only'

import { isAllowedSource } from '@/lib/research/classifier'
import { log, errField } from '@/server/log'
import { withRetry } from '@/server/retry'
import type { FetchedPage, SearchResult, WebResearchProvider } from './provider'

/**
 * Self-hosted SearXNG + Firecrawl OSS research provider — production T9 path.
 *
 * Architecture (compose.shared.yaml ships the containers):
 *   - SearXNG: meta-search engine (free, on-prem, no API key, federated query across many
 *     public search engines). Endpoint: SEARXNG_URL (default http://searxng:8080).
 *   - Firecrawl OSS: page extraction service (cleans HTML → markdown). Endpoint:
 *     FIRECRAWL_URL (default http://firecrawl:3002). Optional FIRECRAWL_API_KEY when running
 *     the SaaS image; self-hosted OSS image can run without auth.
 *
 * Egress posture: both services run inside the project's Docker network. The Next process
 * speaks to them over the internal network; only SearXNG (and only at our explicit query
 * surface) talks to the public internet. Per `apps/web-app/AGENTS.md` masking rules, queries
 * arriving here are ALREADY business-entity-only (classifier strips person/PII upstream) —
 * this provider must never widen that scope.
 *
 * Failure mode: any HTTP error / timeout returns null / [] rather than throwing — the
 * agent loop treats provider failure as "no result for this sub-Q", logs, and moves on.
 */
export function searxngFirecrawlProvider(): WebResearchProvider {
  const searxngUrl = process.env.SEARXNG_URL || 'http://searxng:8080'
  const firecrawlUrl = process.env.FIRECRAWL_URL || 'http://firecrawl:3002'
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || ''

  return {
    name: 'searxng-firecrawl',

    async search(query: string): Promise<SearchResult[]> {
      // SearXNG JSON API: /search?q=...&format=json. Optional &categories=general.
      const u = new URL('/search', searxngUrl)
      u.searchParams.set('q', query)
      u.searchParams.set('format', 'json')
      u.searchParams.set('categories', 'general')

      try {
        const resp = await withRetry(
          async () => {
            const r = await fetch(u, {
              method: 'GET',
              headers: { Accept: 'application/json', 'User-Agent': 'mizan-research/1.0' },
              signal: AbortSignal.timeout(15_000),
            })
            if (!r.ok) {
              const err = new Error(`SearXNG ${r.status} ${r.statusText}`)
              ;(err as Error & { status?: number }).status = r.status
              throw err
            }
            return r
          },
          { retries: 2 },
        )
        const data = (await resp.json()) as { results?: Array<{ url?: string; title?: string; content?: string; score?: number }> }
        if (!Array.isArray(data.results)) return []
        const out: SearchResult[] = []
        for (const r of data.results) {
          if (!r.url || !r.title) continue
          if (!isAllowedSource(r.url)) continue
          out.push({ url: r.url, title: r.title, snippet: r.content ?? '', score: r.score })
        }
        return out
      } catch (e: unknown) {
        log.warn('searxng_search_failed', { query, ...errField(e) })
        return []
      }
    },

    async fetch(url: string): Promise<FetchedPage | null> {
      if (!isAllowedSource(url)) return null
      // Firecrawl: POST /v1/scrape { url, formats: ['markdown'] }. Returns
      // { success: bool, data: { markdown, metadata: { title, ... } } }.
      const u = new URL('/v1/scrape', firecrawlUrl)
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
      if (firecrawlKey) headers.Authorization = `Bearer ${firecrawlKey}`

      try {
        const resp = await withRetry(
          async () => {
            const r = await fetch(u, {
              method: 'POST',
              headers,
              body: JSON.stringify({ url, formats: ['markdown'] }),
              signal: AbortSignal.timeout(45_000),
            })
            if (!r.ok) {
              const err = new Error(`Firecrawl ${r.status} ${r.statusText}`)
              ;(err as Error & { status?: number }).status = r.status
              throw err
            }
            return r
          },
          { retries: 2 },
        )
        const body = (await resp.json()) as {
          success?: boolean
          data?: { markdown?: string; metadata?: { title?: string } }
        }
        if (!body.success || !body.data?.markdown) return null
        return {
          url,
          title: body.data.metadata?.title ?? url,
          text: body.data.markdown,
          fetchedAt: new Date().toISOString(),
        }
      } catch (e: unknown) {
        log.warn('firecrawl_fetch_failed', { url, ...errField(e) })
        return null
      }
    },
  }
}
