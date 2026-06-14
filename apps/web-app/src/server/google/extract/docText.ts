// Flatten a Google Doc into ordered text runs so we can read a span by index
// (for NamedRanges) or the text between two literal tokens (for sentinels).
// Walks paragraphs and recurses into table cells (the templates are table-heavy).

import type { docs_v1 } from 'googleapis'

export interface TextRun {
  start: number
  end: number
  text: string
}

export function collectRuns(
  content: docs_v1.Schema$StructuralElement[] | undefined,
  out: TextRun[] = [],
): TextRun[] {
  if (!content) return out
  for (const el of content) {
    const elements = el.paragraph?.elements
    if (elements) {
      for (const pe of elements) {
        const text = pe.textRun?.content
        if (text != null && pe.startIndex != null && pe.endIndex != null) {
          out.push({ start: pe.startIndex, end: pe.endIndex, text })
        }
      }
    }
    const rows = el.table?.tableRows
    if (rows) {
      for (const row of rows) {
        for (const cell of row.tableCells ?? []) {
          collectRuns(cell.content ?? undefined, out)
        }
      }
    }
  }
  return out
}

// Concatenate the text of all runs overlapping [start, end) (document indices).
export function textInRange(runs: TextRun[], start: number, end: number): string {
  let s = ''
  for (const r of runs) {
    if (r.end <= start || r.start >= end) continue
    s += r.text.slice(Math.max(start, r.start) - r.start, Math.min(end, r.end) - r.start)
  }
  return s
}

// Text strictly between the first `a` and the next `b` after it; null if absent.
export function between(full: string, a: string, b: string): string | null {
  const i = full.indexOf(a)
  if (i < 0) return null
  const j = full.indexOf(b, i + a.length)
  if (j < 0) return null
  return full.slice(i + a.length, j)
}

// Maps each character of the flattened text to its document index, so a literal
// substring can be located back to real doc indices (used by template setup).
export interface CharMap {
  full: string
  at: number[] // at[k] = document index of full[k]
}

export function buildCharMap(content: docs_v1.Schema$StructuralElement[] | undefined): CharMap {
  const runs = collectRuns(content)
  let full = ''
  const at: number[] = []
  for (const r of runs) {
    for (let i = 0; i < r.text.length; i++) {
      full += r.text[i]
      at.push(r.start + i)
    }
  }
  return { full, at }
}

// Locate a literal token; returns its document index range + flat-text offset.
export function findToken(
  cm: CharMap,
  token: string,
  fromOffset = 0,
): { start: number; end: number; offset: number } | null {
  const i = cm.full.indexOf(token, fromOffset)
  if (i < 0) return null
  return { start: cm.at[i], end: cm.at[i + token.length - 1] + 1, offset: i }
}
