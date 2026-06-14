// The field → marker map. Each extractable field is wrapped in the master
// template by a `<marker>_start … <marker>_end` sentinel pair (0pt/white text,
// invisible in print) that is ALSO registered as a Docs NamedRange named
// `<marker>`. Read path: NamedRange first, sentinel fallback (see extract.ts).
//
// `marker` is the base name; sentinels are `${marker}_start` / `${marker}_end`,
// the named range is `${marker}`. `fieldKey` is unique per (doc, marker) so the
// report can address each occurrence (ratios appear in both docs).

import type { DocKind, MatrixAspect, RatioKey } from './types'
import { MATRIX_ASPECTS, RATIO_KEYS } from './types'

export type ParserKind = 'level' | 'text' | 'ratio' | 'currency' | 'percent' | 'rac_block'

// How many period columns the MUAP ratio table exposes (e.g. 2023/2024/interim).
export const RATIO_PERIOD_SLOTS = [0, 1, 2] as const

// Where a parsed field lands in the ExtractedSnapshot.
export type FieldSlot =
  | { kind: 'matrix'; aspect: MatrixAspect; field: 'level' | 'finding' | 'mitigation' }
  | { kind: 'ratio'; key: RatioKey; idx: number }
  | { kind: 'period'; idx: number }
  | { kind: 'collateral'; field: 'marketValue' | 'liquidationValue' | 'sccrPercent' }
  | { kind: 'rac' }

export interface FieldAnchor {
  fieldKey: string
  doc: DocKind
  marker: string
  parser: ParserKind
  // gating = a failure rejects the whole snapshot (caller keeps the prior one).
  // Only the 7 matrix LEVELS gate: they drive scoring/recommendation, so a
  // half-read matrix must never be accepted. Everything else is flagged, not blocking.
  gating: boolean
  slot: FieldSlot
  // Human-readable doc location for the report message.
  where: string
}

// Marker tokens use a Handlebars-style syntax: open `${{field}}`, close `${{/field}}`.
// (The pair brackets a value; for simple fields a lone `${{field}}` can be used.)
export const sentinelStart = (marker: string) => `\${{${marker}}}`
export const sentinelEnd = (marker: string) => `\${{/${marker}}}`

// Section labels for report messages.
const RSK_MATRIX = 'RSK §VII Matriks Risiko'
const MUAP_COLLATERAL = 'MUAP §VII Analisis Agunan'

const MUAP_FIN = 'MUAP §V Analisis Keuangan'

function matrixAnchors(): FieldAnchor[] {
  const out: FieldAnchor[] = []
  for (const aspect of MATRIX_ASPECTS) {
    out.push({
      fieldKey: `${aspect}_level`,
      doc: 'rsk',
      marker: `${aspect}_level`,
      parser: 'level',
      gating: true,
      slot: { kind: 'matrix', aspect, field: 'level' },
      where: `${RSK_MATRIX} — ${aspect}`,
    })
    out.push({
      fieldKey: `${aspect}_finding`,
      doc: 'rsk',
      marker: `${aspect}_finding`,
      parser: 'text',
      gating: false,
      slot: { kind: 'matrix', aspect, field: 'finding' },
      where: `${RSK_MATRIX} — ${aspect}`,
    })
    out.push({
      fieldKey: `${aspect}_mitigation`,
      doc: 'rsk',
      marker: `${aspect}_mitigation`,
      parser: 'text',
      gating: false,
      slot: { kind: 'matrix', aspect, field: 'mitigation' },
      where: `${RSK_MATRIX} — ${aspect}`,
    })
  }
  return out
}

// The MUAP ratio table's period column headers (e.g. "2023", "Apr-2025"), shared
// across all ratio rows. The engine zips these with each ratio's per-column values.
function periodAnchors(): FieldAnchor[] {
  return RATIO_PERIOD_SLOTS.map((idx) => ({
    fieldKey: `fin_period_${idx}`,
    doc: 'muap' as const,
    marker: `fin_period_${idx}`,
    parser: 'text' as const,
    gating: false,
    slot: { kind: 'period', idx } as const,
    where: `${MUAP_FIN} — header periode ${idx}`,
  }))
}

// Ratios as a multi-period series, sourced from the MUAP ratio table (v1; the
// MUAP-vs-RSK cross-check is deferred). One marker per (ratio, period column).
function ratioAnchors(): FieldAnchor[] {
  const out: FieldAnchor[] = []
  for (const key of RATIO_KEYS) {
    for (const idx of RATIO_PERIOD_SLOTS) {
      out.push({
        fieldKey: `ratio_${key}_${idx}`,
        doc: 'muap',
        marker: `ratio_${key}_${idx}`,
        parser: 'ratio',
        gating: false,
        slot: { kind: 'ratio', key, idx },
        where: `${MUAP_FIN} — ${key} (kolom ${idx})`,
      })
    }
  }
  return out
}

const collateralAnchors: FieldAnchor[] = [
  {
    fieldKey: 'collateral_market_value',
    doc: 'muap',
    marker: 'collateral_market_value',
    parser: 'currency',
    gating: false,
    slot: { kind: 'collateral', field: 'marketValue' },
    where: `${MUAP_COLLATERAL} — Nilai Pasar`,
  },
  {
    fieldKey: 'collateral_liquidation_value',
    doc: 'muap',
    marker: 'collateral_liquidation_value',
    parser: 'currency',
    gating: false,
    slot: { kind: 'collateral', field: 'liquidationValue' },
    where: `${MUAP_COLLATERAL} — Nilai Likuidasi (CEV)`,
  },
  {
    fieldKey: 'collateral_sccr_pct',
    doc: 'muap',
    marker: 'collateral_sccr_pct',
    parser: 'percent',
    gating: false,
    slot: { kind: 'collateral', field: 'sccrPercent' },
    where: `${MUAP_COLLATERAL} — SCCR %`,
  },
]

// NOTE: RAC deviations are read structurally from the RSK table (server/google/
// extract/rac.ts), not via a marker — a variable-length table doesn't fit the
// single-span marker model.

export const ANCHORS: readonly FieldAnchor[] = [
  ...matrixAnchors(),
  ...periodAnchors(),
  ...ratioAnchors(),
  ...collateralAnchors,
]

// All distinct markers that the template-setup script must create (per doc).
export function markersForDoc(doc: DocKind): string[] {
  return [...new Set(ANCHORS.filter((a) => a.doc === doc).map((a) => a.marker))]
}
