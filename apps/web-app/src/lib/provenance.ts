// ONE provenance state model (workflow-finetune.md §10 / §15.4). Per-field OCR extraction,
// document review, and AI-narrative citations are the same story — "AI suggested → human
// confirmed → audited" — so they render through ONE vocabulary + ONE StatusChip tone, giving a
// single audit story for OJK and a DRY UI. This is the canonical type the Data-tab field badges
// and the MUAP/RSK citation band consume.
//
//   suggested  — produced by AI/OCR, awaiting the owner's confirmation (review needed)
//   confirmed  — the owner accepted it (or typed it directly) → trusted
//   overridden — the owner corrected the AI/OCR value → trusted (human-authored)
//   ungrounded — an AI narrative claim with no backing source/citation → flag it

import type { StatusTone } from '@/components/shared/StatusChip'
import type { ExtractionSource, LoanApplication } from '@/lib/types'

export type Provenance = 'suggested' | 'confirmed' | 'overridden' | 'ungrounded'

/** Map the per-field ExtractionSource audit value to the shared provenance vocabulary.
 *  human_entered counts as 'confirmed' — a human authored it, so it is trusted like a confirm. */
export function provenanceFromExtractionSource(src: ExtractionSource): Provenance {
  switch (src) {
    case 'ocr_suggested':
      return 'suggested'
    case 'ocr_overridden':
      return 'overridden'
    case 'ocr_confirmed':
    case 'human_entered':
      return 'confirmed'
  }
}

// Colorblind-aware tone choice (§15.4): info(blue) for "review me", success(green) for trusted,
// warning(amber) for "no source". Blue/green/amber stay distinguishable under common CVD AND
// every chip carries a text label — never colour alone.
const TONE: Record<Provenance, StatusTone> = {
  suggested: 'info',
  confirmed: 'success',
  overridden: 'success',
  ungrounded: 'warning',
}

// Bahasa labels — the tri-state the human asked for (Disarankan AI → Dikonfirmasi → Diubah)
// plus the ungrounded flag.
const LABEL: Record<Provenance, string> = {
  suggested: 'Disarankan AI',
  confirmed: 'Dikonfirmasi',
  overridden: 'Diubah',
  ungrounded: 'Tanpa sumber',
}

export function provenanceTone(p: Provenance): StatusTone {
  return TONE[p]
}

export function provenanceLabel(p: Provenance): string {
  return LABEL[p]
}

/** True when the field still needs the owner's attention (suggested or ungrounded). Drives the
 *  Data-nav count badge ("N fields need attention") — distinct from the stage-advance gate. */
export function needsAttention(p: Provenance): boolean {
  return p === 'suggested' || p === 'ungrounded'
}

function positive(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** Count of Data-tab fields awaiting the owner's attention: unconfirmed OCR suggestions PLUS
 *  conservative required-but-empty fields for the relevant desk/stage. This remains an attention
 *  badge, not the authoritative advance gate. Optional blanks are deliberately ignored. */
export function dataAttentionCount(app: Pick<LoanApplication, 'stage' | 'nik' | 'akadType' | 'marginRate' | 'documents' | 'kolEntered' | 'financialsAssessed' | 'financialInputs' | 'extractionSources' | 'extractionMismatches'>): number {
  let count = Object.values(app.extractionSources ?? {}).filter((s) => needsAttention(provenanceFromExtractionSource(s))).length
  // OCR cross-check conflicts (Batch 6) need the owner's attention too — but they are NOT advance
  // blockers (ocrBlockers stays driven by ocr_suggested only); this is the attention badge.
  count += Object.keys(app.extractionMismatches ?? {}).length

  // RM intake identity essentials.
  if (app.stage <= 1 && !app.nik?.trim()) count += 1

  // RM bureau-data: once the SLIK file exists, Kol is required before RM can hand off.
  const hasSlik = app.documents.some((d) => d.docType === 'slik_report' && d.status === 'uploaded')
  if (app.stage <= 2 && hasSlik && !app.kolEntered) count += 1

  // LA financials: count only the required values that make the financial assessment actionable.
  if (app.stage <= 3 && !app.financialsAssessed) {
    if (!positive(app.financialInputs.netMonthlyIncome)) count += 1
    if (!positive(app.financialInputs.collateralAppraisedValue)) count += 1
    if (app.akadType === 'Murabahah' || app.akadType === 'Ijarah') {
      if (!positive(app.marginRate)) count += 1
    } else {
      if (!positive(app.financialInputs.projectedMonthlyProfitShare)) count += 1
      if (!positive(app.financialInputs.nisbahBankPercent) || !positive(app.financialInputs.nisbahCustomerPercent)) count += 1
      if (!app.financialInputs.projectionBasis?.trim()) count += 1
    }
  }

  return count
}
