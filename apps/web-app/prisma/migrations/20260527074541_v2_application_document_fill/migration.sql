-- CreateTable
CREATE TABLE "ApplicationDocumentFill" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "namedRangeId" TEXT,
    "value" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocumentFill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationDocumentFill_appId_idx" ON "ApplicationDocumentFill"("appId");

-- CreateIndex
CREATE INDEX "ApplicationDocumentFill_namedRangeId_idx" ON "ApplicationDocumentFill"("namedRangeId");

-- CreateIndex
CREATE INDEX "ApplicationDocumentFill_status_idx" ON "ApplicationDocumentFill"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDocumentFill_appId_docId_tokenName_key" ON "ApplicationDocumentFill"("appId", "docId", "tokenName");
