-- P2 OCR-widening · design §3 — advisory OCR extraction store. ADDITIVE nullable column only.
-- Record<string, AdvisoryExtraction> — informational + cross-check ONLY, never gating (NIK stays the
-- sole blocker). Mirrors extractionMismatches. Reversible: DROP COLUMN restores prior state.
ALTER TABLE "Application" ADD COLUMN "advisoryExtractions" JSONB;
