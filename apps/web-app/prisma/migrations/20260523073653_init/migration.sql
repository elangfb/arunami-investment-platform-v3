-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "nasabahName" TEXT NOT NULL,
    "nasabahType" TEXT NOT NULL,
    "nik" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "namaUsaha" TEXT,
    "incomeSource" TEXT,
    "isMarried" BOOLEAN,
    "akadType" TEXT NOT NULL,
    "requestedPlafond" BIGINT NOT NULL,
    "requestedTenorMonths" INTEGER NOT NULL,
    "approvedPlafond" BIGINT,
    "approvedTenorMonths" INTEGER,
    "approvedMarginRate" DOUBLE PRECISION,
    "marginRate" DOUBLE PRECISION,
    "purpose" TEXT NOT NULL,
    "collateralType" TEXT,
    "stage" INTEGER NOT NULL,
    "enteredStageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "kolEntered" BOOLEAN NOT NULL DEFAULT false,
    "financialsAssessed" BOOLEAN NOT NULL DEFAULT false,
    "riskRecommendation" TEXT,
    "riskNote" TEXT,
    "komiteDecision" TEXT,
    "komiteDecisionNote" TEXT,
    "muapNarrative" TEXT,
    "muapSyncedAt" TIMESTAMP(3),
    "rskSyncedAt" TIMESTAMP(3),
    "disbursementStatus" TEXT,
    "hardGates" JSONB NOT NULL,
    "hardGateViolations" JSONB NOT NULL DEFAULT '[]',
    "financialInputs" JSONB NOT NULL,
    "analysis" JSONB NOT NULL,
    "extractionSources" JSONB,
    "stage2LegalApproval" JSONB,
    "disbursementConditions" JSONB,
    "aiChatHistory" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "fileName" TEXT,
    "legalVerification" TEXT,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEntry" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "reason" TEXT,

    CONSTRAINT "HistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "StageAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KomiteVote" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "comment" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "isEarlyVote" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "KomiteVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KomiteMeeting" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "agendaAppIds" JSONB NOT NULL,
    "attendeeUserIds" JSONB NOT NULL,
    "chairUserId" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KomiteMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "firebaseUid" TEXT,
    "name" TEXT NOT NULL,
    "avatarInitials" TEXT NOT NULL,
    "title" TEXT,
    "tagline" TEXT,
    "isSuperadmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleDesk" (
    "roleId" TEXT NOT NULL,
    "desk" TEXT NOT NULL,

    CONSTRAINT "RoleDesk_pkey" PRIMARY KEY ("roleId","desk")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserDesk" (
    "userId" TEXT NOT NULL,
    "desk" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "UserDesk_pkey" PRIMARY KEY ("userId","desk")
);

-- CreateTable
CREATE TABLE "DeskCatalog" (
    "desk" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "stage" INTEGER,
    "pipelineRole" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "DeskCatalog_pkey" PRIMARY KEY ("desk")
);

-- CreateTable
CREATE TABLE "ImpersonationAudit" (
    "id" TEXT NOT NULL,
    "superadminId" TEXT NOT NULL,
    "actedAsDesk" TEXT,
    "actedAsUserId" TEXT,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ImpersonationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocLinkage" (
    "applicationId" TEXT NOT NULL,
    "muapDocId" TEXT NOT NULL,
    "rskDocId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocLinkage_pkey" PRIMARY KEY ("applicationId")
);

-- CreateTable
CREATE TABLE "DecisionCheckpoint" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "muapDocId" TEXT NOT NULL,
    "rskDocId" TEXT NOT NULL,
    "muapPdf" BYTEA NOT NULL,
    "rskPdf" BYTEA NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "report" TEXT NOT NULL,
    "snapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_stage_idx" ON "Application"("stage");

-- CreateIndex
CREATE INDEX "Application_createdBy_idx" ON "Application"("createdBy");

-- CreateIndex
CREATE INDEX "ApplicationDocument_applicationId_idx" ON "ApplicationDocument"("applicationId");

-- CreateIndex
CREATE INDEX "HistoryEntry_applicationId_seq_idx" ON "HistoryEntry"("applicationId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "HistoryEntry_applicationId_seq_key" ON "HistoryEntry"("applicationId", "seq");

-- CreateIndex
CREATE INDEX "StageAssignment_applicationId_idx" ON "StageAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "KomiteVote_applicationId_idx" ON "KomiteVote"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "KomiteVote_applicationId_userId_key" ON "KomiteVote"("applicationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "ImpersonationAudit_superadminId_startedAt_idx" ON "ImpersonationAudit"("superadminId", "startedAt");

-- CreateIndex
CREATE INDEX "DecisionCheckpoint_applicationId_createdAt_idx" ON "DecisionCheckpoint"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionRun_applicationId_createdAt_idx" ON "ExtractionRun"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryEntry" ADD CONSTRAINT "HistoryEntry_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageAssignment" ADD CONSTRAINT "StageAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KomiteVote" ADD CONSTRAINT "KomiteVote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleDesk" ADD CONSTRAINT "RoleDesk_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDesk" ADD CONSTRAINT "UserDesk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionRun" ADD CONSTRAINT "ExtractionRun_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "DocLinkage"("applicationId") ON DELETE CASCADE ON UPDATE CASCADE;
