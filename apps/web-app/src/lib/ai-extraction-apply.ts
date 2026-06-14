// Pure shaping of an AI structured-extraction result into write candidates + an extras map. Lives in
// lib/ (NOT a 'use server' module) so it is unit-testable AND never becomes a client-callable action.
// The actual app mutation (cross-check + ocr_suggested provenance) stays in server/actions via the
// existing applyExtractionCandidate spine — this only decides the typed value per field.

import type { FieldKind } from './extraction-registry'

export interface AiExtractionResult {
  known: Record<string, { value: string; confidence: number }>
  extras: Record<string, string>
}

export interface AiExtractionPlan {
  /** One write candidate per known GATING/IDENTITY field — gating coerced to number, identity kept string. */
  candidates: { fieldPath: string; value: string | number }[]
  /** Known ADVISORY fields (RM-led OCR-widening, design §3): routed to advisoryExtractions, NEVER to a
   *  gating candidate — so even under a real OCR provider an advisory reading can never reach a hard
   *  gate, identity field, or any blocker set (NIK stays the sole blocker). */
  advisory: { key: string; value: string | number }[]
  /** Extras stashed with their source doc-type (Data-tab display; promotable to a column later). */
  extras: Record<string, { value: string; sourceDocType: string }>
}

/**
 * Shape an AI extraction into write candidates + advisory + extras. Gating fields (Kol/income/
 * appraisal) are coerced to number so they re-enter the confirm+recompute flow exactly like a regex
 * suggestion; identity fields stay strings; ADVISORY fields (omzet/labaBersih/…) are split OUT to the
 * advisory list (never a gating candidate). `kindOf` returns the registry kind for a fieldPath.
 */
export function planAiExtraction(
  extraction: AiExtractionResult,
  docType: string,
  kindOf: (fieldPath: string) => FieldKind | undefined,
): AiExtractionPlan {
  const candidates: { fieldPath: string; value: string | number }[] = []
  const advisory: { key: string; value: string | number }[] = []
  for (const [fieldPath, { value }] of Object.entries(extraction.known)) {
    const kind = kindOf(fieldPath)
    if (kind === 'advisory') {
      // ADVISORY: never a gating write — route to the advisory store via its KEY.
      advisory.push({ key: fieldPath, value })
      continue
    }
    candidates.push({ fieldPath, value: kind === 'gating' ? Number(value) : value })
  }
  const extras: Record<string, { value: string; sourceDocType: string }> = {}
  for (const [key, value] of Object.entries(extraction.extras)) {
    extras[key] = { value, sourceDocType: docType }
  }
  return { candidates, advisory, extras }
}
