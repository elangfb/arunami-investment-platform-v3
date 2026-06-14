-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "rskCroSignerUserId" TEXT;

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "reason" TEXT,
    "qrToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_qrToken_key" ON "ApprovalStep"("qrToken");

-- CreateIndex
CREATE INDEX "ApprovalStep_applicationId_chain_idx" ON "ApprovalStep"("applicationId", "chain");

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
