import { isAllowedSource } from '@/lib/research/classifier'
import type { FetchedPage, SearchResult, WebResearchProvider } from './provider'

// Deterministic offline web-research provider — the dev/CI default. NO network calls. Produces
// plausible search results + page extracts derived from the query (which itself is already
// business-only thanks to the egress classifier), so the pipeline runs end-to-end with no
// SearXNG/Firecrawl config. Real-world data lands behind the `firecrawl` provider (when
// configured + Bank-Legal-cleared). All result URLs are within the source allowlist so the
// downstream filter never drops them in dev.
export function stubResearchProvider(): WebResearchProvider {
  return {
    name: 'stub',
    async search(query: string): Promise<SearchResult[]> {
      const slug = query.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '')
      const base = (host: string, path: string) => `https://${host}/${path}/${slug}`
      const candidates: SearchResult[] = [
        { url: base('ahu.go.id', 'pencarian'), title: `AHU — Profil ${query}`, snippet: 'Dummy registry entry (stub provider).', score: 0.92 },
        { url: base('oss.go.id', 'nib'), title: `OSS NIB — ${query}`, snippet: 'Dummy OSS issuance summary (stub).', score: 0.81 },
        { url: base('idx.co.id', 'profil'), title: `IDX — Profil emiten ${query}`, snippet: 'Dummy listed-entity summary (stub).', score: 0.74 },
        { url: base('kompas.com', 'bisnis'), title: `Kompas — Berita ${query}`, snippet: 'Dummy news headline (stub).', score: 0.62 },
      ]
      return candidates.filter((r) => isAllowedSource(r.url))
    },
    async fetch(url: string): Promise<FetchedPage | null> {
      if (!isAllowedSource(url)) return null
      return {
        url,
        title: `Stub fetch — ${url}`,
        text: [
          '# Stub fetch result',
          '',
          'Konten dummy untuk pipeline dev/CI. Tidak ada egress.',
          'Halaman ini akan diganti oleh ekstraksi nyata saat WEB_RESEARCH_PROVIDER=firecrawl.',
        ].join('\n'),
        fetchedAt: new Date().toISOString(),
      }
    },
  }
}
