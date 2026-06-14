-- CreateTable
CREATE TABLE "CommitteeRoomsVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rooms" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitteeRoomsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommitteeRoomsVersion_version_key" ON "CommitteeRoomsVersion"("version");

-- CreateIndex
CREATE INDEX "CommitteeRoomsVersion_effectiveFrom_idx" ON "CommitteeRoomsVersion"("effectiveFrom");
