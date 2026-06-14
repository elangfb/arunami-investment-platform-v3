-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "sourceDocId" TEXT,
    "trigger" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentVersion_applicationId_kind_createdAt_idx" ON "DocumentVersion"("applicationId", "kind", "createdAt");

