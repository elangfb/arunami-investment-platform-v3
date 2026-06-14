-- P1 · ADR-0020: Customer entity — ADDITIVE + dual-read. `stage` Int stays SSOT (Fork A1).
-- Reversible: DROP TABLE "Customer" + drop "Application"."customerId" restores the prior state.

-- 1. Customer table
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nik" TEXT,
    "npwp" TEXT,
    "nib" TEXT,
    "alamat" TEXT,
    "bidangUsaha" TEXT,
    "nama" TEXT,
    "namaUsaha" TEXT,
    "phoneNumber" TEXT,
    "whatsappNumber" TEXT,
    "pengurus" JSONB,
    "pemegangSaham" JSONB,
    "isMarried" BOOLEAN,
    "incomeSource" TEXT,
    "extractionExtras" JSONB,
    "contextMd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Customer_nik_idx" ON "Customer"("nik");
CREATE INDEX "Customer_npwp_idx" ON "Customer"("npwp");
CREATE INDEX "Customer_nib_idx" ON "Customer"("nib");

-- 2. Application.customerId FK (nullable during the dual-read window)
ALTER TABLE "Application" ADD COLUMN "customerId" TEXT;
CREATE INDEX "Application_customerId_idx" ON "Application"("customerId");
ALTER TABLE "Application" ADD CONSTRAINT "Application_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. 1:1 backfill — one Customer per existing Application; id = 'cust_' || app.id (deterministic, 1:1).
INSERT INTO "Customer" (
    "id", "type", "nik", "npwp", "nib", "alamat", "bidangUsaha", "nama", "namaUsaha",
    "phoneNumber", "whatsappNumber", "isMarried", "incomeSource", "extractionExtras",
    "createdAt", "createdBy", "updatedAt"
)
SELECT
    'cust_' || a."id",
    a."nasabahType",
    a."nik", a."npwp", a."nib", a."alamat", a."bidangUsaha",
    CASE WHEN a."nasabahType" = 'individual' THEN a."nasabahName" ELSE NULL END,
    CASE WHEN a."nasabahType" = 'business' THEN COALESCE(a."namaUsaha", a."nasabahName") ELSE NULL END,
    a."phoneNumber", a."whatsappNumber",
    CASE WHEN a."nasabahType" = 'individual' THEN a."isMarried" ELSE NULL END,
    CASE WHEN a."nasabahType" = 'individual' THEN a."incomeSource" ELSE NULL END,
    a."extractionExtras",
    a."createdAt", a."createdBy", a."createdAt"
FROM "Application" a;

UPDATE "Application" a SET "customerId" = 'cust_' || a."id";
