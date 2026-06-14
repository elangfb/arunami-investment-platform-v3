-- Batch 9 T4-AI foundation: business sector + open OCR-extras map (Data-tab display).
ALTER TABLE "Application" ADD COLUMN "bidangUsaha" TEXT;
ALTER TABLE "Application" ADD COLUMN "extractionExtras" JSONB;
