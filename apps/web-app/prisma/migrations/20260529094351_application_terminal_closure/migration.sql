-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "applicationStatus" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "conditionalResponse" TEXT;

-- CreateIndex
CREATE INDEX "Application_applicationStatus_idx" ON "Application"("applicationStatus");
