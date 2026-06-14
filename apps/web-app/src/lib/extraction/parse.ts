// Pure parsers for extracted cell content. No I/O. Each returns null on
// unparseable non-empty input so the engine can mark `parse_failed`.

import type { RiskLevel, RacDeviationItem } from './types'

// Parse a locale number from messy cell text. Handles Indonesian and English
// grouping, currency, percent and ratio suffixes:
//   "Rp 2.500.000.000,-" → 2500000000
//   "87,22%"             → 87.22
//   "1,2x"               → 1.2
//   "1,234,567.89"       → 1234567.89
//   "2.500.000.000"      → 2500000000
export function parseLocaleNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null
  let s = String(raw)
    .replace(/rp/gi, '')
    .replace(/[x×]/gi, '')
    .replace(/%/g, '')
    .replace(/,-/g, '')
    .replace(/\s+/g, '')
  s = s.replace(/[^0-9.,-]/g, '')
  // keep a single leading minus
  const neg = s.startsWith('-')
  s = s.replace(/-/g, '')
  if (!/\d/.test(s)) return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decimalSep = ''
  if (lastComma > -1 && lastDot > -1) {
    decimalSep = lastComma > lastDot ? ',' : '.'
  } else if (lastComma > -1) {
    const trailing = s.length - 1 - lastComma
    if (s.split(',').length === 2 && trailing > 0 && trailing <= 2) decimalSep = ','
  } else if (lastDot > -1) {
    const trailing = s.length - 1 - lastDot
    if (s.split('.').length === 2 && trailing > 0 && trailing <= 2) decimalSep = '.'
  }

  let normalized: string
  if (decimalSep) {
    const thousands = decimalSep === ',' ? '.' : ','
    normalized = s.split(thousands).join('').replace(decimalSep, '.')
  } else {
    normalized = s.replace(/[.,]/g, '')
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

const LEVEL_MAP: Array<[RegExp, RiskLevel]> = [
  // order matters: "moderate to high" / "sedang-tinggi" should resolve to high
  [/\b(high|tinggi)\b/i, 'high'],
  [/\b(low|rendah)\b/i, 'low'],
  [/\b(medium|moderate|sedang|menengah)\b/i, 'medium'],
]

export function parseRiskLevel(raw: string | null | undefined): RiskLevel | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  // "Moderate to High" / "Sedang ke Tinggi" → take the highest mentioned.
  const hasHigh = /\b(high|tinggi)\b/i.test(s)
  const hasMed = /\b(medium|moderate|sedang|menengah)\b/i.test(s)
  const hasLow = /\b(low|rendah)\b/i.test(s)
  if (hasHigh) return 'high'
  if (hasMed) return 'medium'
  if (hasLow) return 'low'
  // fall back to single-token map (covers exact tokens without word boundaries)
  for (const [re, level] of LEVEL_MAP) if (re.test(s)) return level
  return null
}

// A RAC-deviation block. The Google adapter joins each table row's cells with
// " | " and rows with "\n"; the first cell is the row number and is dropped.
// Tolerant of free-text: a line without a delimiter becomes item-only.
export function parseRacBlock(raw: string | null | undefined): RacDeviationItem[] {
  if (raw == null) return []
  const lines = String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const items: RacDeviationItem[] = []
  for (const line of lines) {
    // split on " | ", tab, or em/en dash used as a column separator
    const parts = line.split(/\s*\|\s*|\t/).map((p) => p.trim()).filter(Boolean)
    let cells = parts
    // drop a leading pure-number "No." cell
    if (cells.length > 1 && /^\d+\.?$/.test(cells[0])) cells = cells.slice(1)
    if (cells.length === 0) continue
    if (cells.length === 1) {
      items.push({ item: cells[0], justification: '' })
    } else {
      items.push({ item: cells[0], justification: cells.slice(1).join(' — ') })
    }
  }
  return items
}
