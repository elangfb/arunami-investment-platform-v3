-- Batch 9 (OCR identity expansion): legal-identity fields filling MUAP IDENTITAS HUKUM slots.
-- Nullable TEXT — OCR-suggested + human-confirmed, like nik. No backfill needed.
ALTER TABLE "Application" ADD COLUMN "npwp" TEXT;
ALTER TABLE "Application" ADD COLUMN "nib" TEXT;
ALTER TABLE "Application" ADD COLUMN "alamat" TEXT;
