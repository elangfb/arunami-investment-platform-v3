-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "aiAssistantLog" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "AiInteraction" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "maskedPrompt" TEXT NOT NULL,
    "maskedReply" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInteraction_applicationId_createdAt_idx" ON "AiInteraction"("applicationId", "createdAt");
