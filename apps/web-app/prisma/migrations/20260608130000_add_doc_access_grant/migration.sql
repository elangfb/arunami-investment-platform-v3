-- CreateTable
CREATE TABLE "DocAccessGrant" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissionId" TEXT,
    "grantedToUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocAccessGrant_applicationId_idx" ON "DocAccessGrant"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "DocAccessGrant_docId_email_key" ON "DocAccessGrant"("docId", "email");
