-- CreateTable
CREATE TABLE "HolidayCalendarVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "added" TEXT[],
    "removed" TEXT[],
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayCalendarVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HolidayCalendarVersion_version_key" ON "HolidayCalendarVersion"("version");

-- CreateIndex
CREATE INDEX "HolidayCalendarVersion_effectiveFrom_idx" ON "HolidayCalendarVersion"("effectiveFrom");
