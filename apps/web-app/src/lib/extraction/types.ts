// Extraction types — the structured high-value subset we pull back out of the
// per-application MUAP / RSK Google Docs, plus the report that tells an analyst
// exactly which marker to fix when a field can't be read.
//
// This module is pure data shapes: no Google, no DB, no React. The Google
// adapter (src/server/google/extract) feeds the engine via MarkerResolver; the
// DB persists ExtractedSnapshot; the detail tabs render it.

export type DocKind = 'muap' | 'rsk'

// 5C+2S risk matrix (RSK §VII). Extends the app's 5C+1S (scoring.ts) with the
// two sharia dimensions the real RSK template separates: compliance (halal
// object / akad suitability) and structuring (no hidden riba/gharar).
export type MatrixAspect =
  | 'character'
  | 'capacity'
  | 'capital'
  | 'collateral'
  | 'condition'
  | 'sharia_compliance'
  | 'sharia_structuring'

export const MATRIX_ASPECTS: readonly MatrixAspect[] = [
  'character',
  'capacity',
  'capital',
  'collateral',
  'condition',
  'sharia_compliance',
  'sharia_structuring',
] as const

// Normalized risk level. The templates write Low/Medium/High and the Indonesian
// Rendah/Sedang/Tinggi (plus "Moderate to High"); parseRiskLevel folds them here.
export type RiskLevel = 'low' | 'medium' | 'high'

// Multi-period financial-statement ratios from the MUAP ratio table.
// NOTE: DSR/LTV are the app's own consumer-style hard gates (hardGates.ts), and
// SCCR is a collateral-coverage metric (see CollateralSummary) — neither is a
// time-series financial ratio, so neither lives here.
export type RatioKey =
  | 'dscri'        // Debt Service Coverage Ratio (syariah)
  | 'der'          // Debt to Equity Ratio
  | 'currentRatio'
  | 'gpm'          // Gross Profit Margin
  | 'npm'          // Net Profit Margin

export const RATIO_KEYS: readonly RatioKey[] = ['dscri', 'der', 'currentRatio', 'gpm', 'npm'] as const

// ── Extracted snapshot ──────────────────────────────────────────────────────

export interface FiveCSMatrixRow {
  aspect: MatrixAspect
  level: RiskLevel | null
  finding: string
  mitigation: string
}

// One period's value in a ratio time series.
export interface RatioPoint {
  period: string // column header, e.g. "2023" / "Apr-2025"
  // Normalized numeric: percentages as the number (87.22), ratios as the
  // multiple (1.2 for "1,2x"). null when the cell was blank/unparseable.
  value: number | null
  raw: string
}

// A ratio extracted as a multi-period series (the MUAP ratio table has 3 year
// columns). points are index-aligned to the doc's period headers; empty slots
// are dropped. sourceDoc is the doc the series came from (MUAP for v1).
export interface FinancialRatioSeries {
  key: RatioKey
  points: RatioPoint[]
  sourceDoc: DocKind | null
}

export interface CollateralSummary {
  marketValue: number | null
  liquidationValue: number | null
  sccrPercent: number | null
}

export interface RacDeviationItem {
  item: string
  justification: string
}

export interface ExtractedSnapshot {
  matrix: FiveCSMatrixRow[]
  ratios: FinancialRatioSeries[]
  collateral: CollateralSummary
  racDeviations: RacDeviationItem[]
}

// ── Extraction report ───────────────────────────────────────────────────────

// ok          — read + parsed cleanly
// missing_anchor — neither named range nor sentinel resolved (marker deleted)
// empty       — anchor resolved but the analyst left it blank
// parse_failed — content present but unparseable (e.g. "tinggi sekali" as level)
// conflict    — same logical field read from MUAP and RSK with differing values
export type FieldStatus = 'ok' | 'missing_anchor' | 'empty' | 'parse_failed' | 'conflict'

// How the content was located, for diagnostics + to know when to repair ranges.
export type AnchorSource = 'named_range' | 'sentinel' | 'none'

export interface FieldReport {
  fieldKey: string
  doc: DocKind
  status: FieldStatus
  source: AnchorSource
  raw?: string
  // Human-actionable, e.g. "RSK §VII — Capacity: nilai 'NA' tidak dikenali; perbaiki sel."
  message?: string
}

export interface ExtractionReport {
  runId: string
  extractedAt: string // ISO
  // true iff no GATING field failed. Non-gating flags can still be present.
  ok: boolean
  fields: FieldReport[]
}

export interface ExtractionResult {
  report: ExtractionReport
  // The new snapshot when accepted (ok, or only non-gating failures present);
  // null when rejected (a gating field failed) so the caller keeps the prior one.
  snapshot: ExtractedSnapshot | null
}
