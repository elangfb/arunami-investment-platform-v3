-- ADR-0019 §3 (V1) — per-email root-folder share. ADDITIVE new tables only.
-- DriveRef: tiny key→folderId registry; row 'mizan-root' = the single root "Mizan" folder every
-- per-app Mizan-owned generated-doc folder is parented under (Drive permissions inherit downward).
-- DriveRootGrant: the per-user 'reader' audit ledger on that root (ADR-0014 intent preserved at
-- folder granularity; permissionId kept for a future revoke). Reversible: DROP TABLE.
CREATE TABLE "DriveRef" (
    "key" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveRef_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "DriveRootGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissionId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveRootGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriveRootGrant_email_key" ON "DriveRootGrant"("email");

CREATE INDEX "DriveRootGrant_userId_idx" ON "DriveRootGrant"("userId");
