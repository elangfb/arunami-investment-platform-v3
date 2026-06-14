// RAC deviations are a variable-length table, not a single value — so we read
// them structurally from the RSK doc (RSK §1.3) rather than via a marker.

import type { docs_v1 } from 'googleapis'
import type { RacDeviationItem } from '../../../lib/extraction/types'
import { collectRuns } from './docText'

function cellText(cell?: docs_v1.Schema$TableCell): string {
  if (!cell) return ''
  return collectRuns(cell.content ?? undefined)
    .map((r) => r.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

// Find the RAC table (header has Isu/Deviasi + Mitigasi/Catatan columns) and read
// each data row → { item: Isu, justification: Mitigasi }. Empty rows are skipped.
export function readRacDeviations(doc: docs_v1.Schema$Document): RacDeviationItem[] {
  const table = (doc.body?.content ?? [])
    .map((el) => el.table)
    .find((t): t is docs_v1.Schema$Table => {
      if (!t) return false
      const r0 = (t.tableRows?.[0]?.tableCells ?? []).map((c) => cellText(c))
      return r0.some((c) => /isu|deviasi/i.test(c)) && r0.some((c) => /mitigasi|catatan/i.test(c))
    })
  if (!table) return []

  const out: RacDeviationItem[] = []
  for (const row of (table.tableRows ?? []).slice(1)) {
    const cells = row.tableCells ?? []
    const item = cellText(cells[1])
    if (!item) continue
    out.push({ item, justification: cellText(cells[3]) })
  }
  return out
}
