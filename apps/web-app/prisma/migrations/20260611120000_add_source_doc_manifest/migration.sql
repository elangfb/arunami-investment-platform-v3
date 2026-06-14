-- P2 · design §3 "Versioning (source docs)" / Fork B5 — content-addressed source-doc manifest ledger.
-- ADDITIVE: new table only, two nullable FK columns reference existing tables. No existing column changes.
-- Reversible: DROP TABLE "SourceDocManifestEntry" restores the prior state (no data loss elsewhere).

CREATE TABLE "SourceDocManifestEntry" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "customerId" TEXT,
    "docType" TEXT NOT NULL,
    "fullPath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "fileId" TEXT,
    "driveRevisionId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedBy" TEXT NOT NULL,
    CONSTRAINT "SourceDocManifestEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SourceDocManifestEntry_applicationId_idx" ON "SourceDocManifestEntry"("applicationId");
CREATE INDEX "SourceDocManifestEntry_customerId_idx" ON "SourceDocManifestEntry"("customerId");
CREATE INDEX "SourceDocManifestEntry_sha256_idx" ON "SourceDocManifestEntry"("sha256");

ALTER TABLE "SourceDocManifestEntry" ADD CONSTRAINT "SourceDocManifestEntry_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceDocManifestEntry" ADD CONSTRAINT "SourceDocManifestEntry_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
