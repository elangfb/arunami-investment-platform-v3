-- Batch 6: OCR cross-check conflicts (Record<string, ExtractionMismatch>), additive + nullable.
ALTER TABLE "Application" ADD COLUMN "extractionMismatches" JSONB;
