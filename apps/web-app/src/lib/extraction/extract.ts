// The extraction engine. Pure: it consumes a MarkerResolver per doc (the
// Google adapter implements these against documents.get) and produces an
// ExtractedSnapshot + ExtractionReport. Atomic: if any gating field fails the
// snapshot is rejected (null) so the caller retains the prior good one.

import type { FieldAnchor } from './anchors'
import { ANCHORS, sentinelStart, sentinelEnd } from './anchors'
import { parseLocaleNumber, parseRiskLevel, parseRacBlock } from './parse'
import type {
  AnchorSource,
  CollateralSummary,
  DocKind,
  ExtractedSnapshot,
  ExtractionReport,
  ExtractionResult,
  FieldReport,
  FieldStatus,
  FinancialRatioSeries,
  FiveCSMatrixRow,
  MatrixAspect,
  RacDeviationItem,
  RatioPoint,
  RiskLevel,
} from './types'
import { MATRIX_ASPECTS, RATIO_KEYS } from './types'
import { RATIO_PERIOD_SLOTS } from './anchors'

// What the Google adapter must provide for one doc. Both return null when the
// anchor is absent; a present-but-empty range returns ''.
export interface MarkerResolver {
  namedRange(name: string): string | null
  sentinel(name: string): string | null
}

export type DocResolvers = Record<DocKind, MarkerResolver>

export interface ExtractOptions {
  now?: () => Date
  runId?: string
}

interface FieldOutcome {
  anchor: FieldAnchor
  status: FieldStatus
  source: AnchorSource
  raw: string | null
  // parsed payload, by parser kind
  level?: RiskLevel | null
  num?: number | null
  text?: string
  rac?: RacDeviationItem[]
}

function locate(resolver: MarkerResolver, marker: string): { raw: string | null; source: AnchorSource } {
  const nr = resolver.namedRange(marker)
  if (nr != null && nr.trim() !== '') return { raw: nr, source: 'named_range' }
  const se = resolver.sentinel(marker)
  if (se != null && se.trim() !== '') return { raw: se, source: 'sentinel' }
  // present-but-empty: still report which anchor resolved (so it reads 'empty')
  if (nr != null) return { raw: nr, source: 'named_range' }
  if (se != null) return { raw: se, source: 'sentinel' }
  return { raw: null, source: 'none' }
}

function evaluate(anchor: FieldAnchor, resolvers: DocResolvers): FieldOutcome {
  const { raw, source } = locate(resolvers[anchor.doc], anchor.marker)
  if (raw == null) return { anchor, status: 'missing_anchor', source, raw }
  if (raw.trim() === '') return { anchor, status: 'empty', source, raw }

  switch (anchor.parser) {
    case 'level': {
      const level = parseRiskLevel(raw)
      return { anchor, source, raw, level, status: level ? 'ok' : 'parse_failed' }
    }
    case 'ratio':
    case 'currency':
    case 'percent': {
      const num = parseLocaleNumber(raw)
      return { anchor, source, raw, num, status: num == null ? 'parse_failed' : 'ok' }
    }
    case 'text':
      return { anchor, source, raw, text: raw.trim(), status: 'ok' }
    case 'rac_block': {
      const rac = parseRacBlock(raw)
      return { anchor, source, raw, rac, status: rac.length ? 'ok' : 'parse_failed' }
    }
  }
}

function messageFor(o: FieldOutcome): string | undefined {
  const at = o.anchor.where
  switch (o.status) {
    case 'missing_anchor':
      return `${at}: penanda '${o.anchor.marker}' tidak ditemukan — periksa apakah sel terhapus di Google Docs.`
    case 'empty':
      return `${at}: belum diisi.`
    case 'parse_failed':
      return `${at}: nilai '${(o.raw ?? '').trim()}' tidak dapat dibaca — perbaiki sel.`
    case 'conflict':
      return `${at}: nilai berbeda antara MUAP dan RSK — selaraskan.`
    default:
      return undefined
  }
}

export function extract(resolvers: DocResolvers, opts: ExtractOptions = {}): ExtractionResult {
  const outcomes = ANCHORS.map((a) => evaluate(a, resolvers))
  const byKey = new Map<string, FieldOutcome>(outcomes.map((o) => [o.anchor.fieldKey, o]))

  // ── Ratios as multi-period series (MUAP) ───────────────────────────────────
  const periods = RATIO_PERIOD_SLOTS.map((i) => byKey.get(`fin_period_${i}`)?.text ?? '')
  const ratioSeries: FinancialRatioSeries[] = RATIO_KEYS.map((key) => {
    const points: RatioPoint[] = RATIO_PERIOD_SLOTS.map((i) => {
      const o = byKey.get(`ratio_${key}_${i}`)
      const value = o?.status === 'ok' ? o.num ?? null : null
      return { period: periods[i] ?? '', value, raw: o?.raw ?? '' }
    }).filter((p) => p.period !== '' || p.value != null)
    return { key, points, sourceDoc: points.some((p) => p.value != null) ? 'muap' : null }
  })

  // ── Assemble the rest of the snapshot ──────────────────────────────────────
  const matrix: FiveCSMatrixRow[] = MATRIX_ASPECTS.map((aspect) => ({
    aspect,
    level: matrixLevel(byKey, aspect),
    finding: byKey.get(`${aspect}_finding`)?.text ?? '',
    mitigation: byKey.get(`${aspect}_mitigation`)?.text ?? '',
  }))

  const collateral: CollateralSummary = {
    marketValue: byKey.get('collateral_market_value')?.num ?? null,
    liquidationValue: byKey.get('collateral_liquidation_value')?.num ?? null,
    sccrPercent: byKey.get('collateral_sccr_pct')?.num ?? null,
  }

  const racDeviations: RacDeviationItem[] = byKey.get('rac_deviations')?.rac ?? []

  // ── Report + gating ────────────────────────────────────────────────────────
  const fields: FieldReport[] = outcomes.map((o) => ({
    fieldKey: o.anchor.fieldKey,
    doc: o.anchor.doc,
    status: o.status,
    source: o.source,
    raw: o.raw ?? undefined,
    message: messageFor(o),
  }))

  const gatingFailed = outcomes.some((o) => o.anchor.gating && o.status !== 'ok')

  const report: ExtractionReport = {
    runId: opts.runId ?? randomId(),
    extractedAt: (opts.now?.() ?? new Date()).toISOString(),
    ok: !gatingFailed,
    fields,
  }

  const snapshot: ExtractedSnapshot | null = gatingFailed
    ? null
    : { matrix, ratios: ratioSeries, collateral, racDeviations }

  return { report, snapshot }
}

function matrixLevel(byKey: Map<string, FieldOutcome>, aspect: MatrixAspect): RiskLevel | null {
  const o = byKey.get(`${aspect}_level`)
  return o?.status === 'ok' ? o.level ?? null : null
}

function randomId(): string {
  // Available in Node 19+ and modern browsers; fall back just in case.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Re-export the sentinel helpers so the Google adapter and template-setup script
// share one source of truth for marker naming.
export { sentinelStart, sentinelEnd }
