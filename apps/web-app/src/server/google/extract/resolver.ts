// Adapts a fetched Google Doc to the engine's MarkerResolver: NamedRange lookup
// (fast path) + sentinel-text fallback. The pure engine (lib/extraction/extract)
// decides precedence and parsing.

import type { docs_v1 } from 'googleapis'
import type { MarkerResolver } from '../../../lib/extraction/extract'
import { sentinelStart, sentinelEnd } from '../../../lib/extraction/anchors'
import { collectRuns, textInRange, between } from './docText'

export function makeResolver(doc: docs_v1.Schema$Document): MarkerResolver {
  const runs = collectRuns(doc.body?.content ?? undefined)
  const full = runs.map((r) => r.text).join('')
  const named = doc.namedRanges ?? {}
  return {
    namedRange(name) {
      const group = named[name]
      if (!group?.namedRanges?.length) return null
      let text = ''
      for (const nr of group.namedRanges) {
        for (const range of nr.ranges ?? []) {
          if (range.startIndex != null && range.endIndex != null) {
            text += textInRange(runs, range.startIndex, range.endIndex)
          }
        }
      }
      return text
    },
    sentinel(name) {
      return between(full, sentinelStart(name), sentinelEnd(name))
    },
  }
}
