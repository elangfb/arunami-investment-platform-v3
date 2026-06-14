-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "plan" JSONB,
    "progress" JSONB,
    "exploredSourcesPartial" JSONB,
    "costEstimateUsd" DOUBLE PRECISION,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "llmCalls" INTEGER NOT NULL DEFAULT 0,
    "fetches" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "elapsedMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "query" TEXT,
    "url" TEXT,
    "prompt" TEXT,
    "response" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchJob_status_idx" ON "ResearchJob"("status");

-- CreateIndex
CREATE INDEX "ResearchJob_appId_idx" ON "ResearchJob"("appId");

-- CreateIndex
CREATE INDEX "ResearchJob_createdAt_idx" ON "ResearchJob"("createdAt");

-- CreateIndex
CREATE INDEX "ResearchStep_jobId_idx" ON "ResearchStep"("jobId");

-- CreateIndex
CREATE INDEX "ResearchStep_timestamp_idx" ON "ResearchStep"("timestamp");

-- AddForeignKey
ALTER TABLE "ResearchStep" ADD CONSTRAINT "ResearchStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
