-- P2 Batch B · design §3 — two-folder Drive model. ADDITIVE nullable columns only.
-- Reversible: DROP COLUMN restores prior state. No data backfill.
ALTER TABLE "Customer" ADD COLUMN "driveFolderId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "driveFolderOwner" TEXT;
ALTER TABLE "Application" ADD COLUMN "driveFolderId" TEXT;
ALTER TABLE "Application" ADD COLUMN "driveFolderOwner" TEXT;
