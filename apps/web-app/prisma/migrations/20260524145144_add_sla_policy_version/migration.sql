-- CreateTable
CREATE TABLE "SlaPolicyVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "targets" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicyVersion_version_key" ON "SlaPolicyVersion"("version");

-- CreateIndex
CREATE INDEX "SlaPolicyVersion_effectiveFrom_idx" ON "SlaPolicyVersion"("effectiveFrom");
