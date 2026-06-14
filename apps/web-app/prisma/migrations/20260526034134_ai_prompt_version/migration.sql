-- CreateTable
CREATE TABLE "AiPromptVersion" (
    "promptKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "systemInstruction" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("promptKey","version")
);

-- CreateIndex
CREATE INDEX "AiPromptVersion_promptKey_effectiveFrom_idx" ON "AiPromptVersion"("promptKey", "effectiveFrom");
