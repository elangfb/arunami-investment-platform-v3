-- CreateTable
CREATE TABLE "RiskPolicyVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dsrMaxPct" INTEGER NOT NULL,
    "ltvMaxPct" INTEGER NOT NULL,
    "kolMax" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskPolicyVersion_version_key" ON "RiskPolicyVersion"("version");

-- CreateIndex
CREATE INDEX "RiskPolicyVersion_effectiveFrom_idx" ON "RiskPolicyVersion"("effectiveFrom");
