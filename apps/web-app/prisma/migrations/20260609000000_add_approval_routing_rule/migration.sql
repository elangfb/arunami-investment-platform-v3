-- CreateTable
CREATE TABLE "ApprovalRoutingRule" (
    "id" TEXT NOT NULL,
    "makerUserId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "routing" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRoutingRule_makerUserId_chain_idx" ON "ApprovalRoutingRule"("makerUserId", "chain");

-- CreateIndex
CREATE INDEX "ApprovalRoutingRule_effectiveFrom_idx" ON "ApprovalRoutingRule"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRoutingRule_makerUserId_chain_version_key" ON "ApprovalRoutingRule"("makerUserId", "chain", "version");
