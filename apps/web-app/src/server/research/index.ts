import 'server-only'

import { stubResearchProvider } from './stub'
import type { WebResearchProvider } from './provider'

// Provider registry — pick via WEB_RESEARCH_PROVIDER env (default 'stub'). Add a provider:
// implement WebResearchProvider, lazy-register here, ship the env config. Lazy-imports keep
// optional providers (and their network/AGPL deps) off the dev/CI bundle path.

const PROVIDERS: Record<string, () => Promise<WebResearchProvider>> = {
  async stub() {
    return stubResearchProvider()
  },
  // Self-hosted SearXNG (search) + Firecrawl OSS (extract). Lazy-loaded so the dev/CI bundle
  // stays slim. Activate via WEB_RESEARCH_PROVIDER=searxng-firecrawl; compose.shared.yaml ships the containers.
  // + env SEARXNG_URL / FIRECRAWL_URL (defaults to internal compose hostnames).
  async 'searxng-firecrawl'() {
    const { searxngFirecrawlProvider } = await import('./searxng-firecrawl')
    return searxngFirecrawlProvider()
  },
}

export async function webResearchProvider(): Promise<WebResearchProvider> {
  const key = process.env.WEB_RESEARCH_PROVIDER || 'stub'
  const factory = PROVIDERS[key]
  if (!factory) {
    throw new Error(`Unknown WEB_RESEARCH_PROVIDER "${key}" (known: ${Object.keys(PROVIDERS).join(', ')})`)
  }
  return factory()
}

export type { WebResearchProvider, SearchResult, FetchedPage, ResearchContext } from './provider'
