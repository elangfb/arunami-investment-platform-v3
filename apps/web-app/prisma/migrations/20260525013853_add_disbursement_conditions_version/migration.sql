-- CreateTable
CREATE TABLE "DisbursementConditionsVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisbursementConditionsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementConditionsVersion_version_key" ON "DisbursementConditionsVersion"("version");

-- CreateIndex
CREATE INDEX "DisbursementConditionsVersion_effectiveFrom_idx" ON "DisbursementConditionsVersion"("effectiveFrom");
