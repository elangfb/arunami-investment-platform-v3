-- P3-C · colek — directed desk-to-desk work request (RM-led redesign). ADDITIVE: new table only.
-- Reversible: DROP TABLE "DeskAssignment" restores prior state.
CREATE TABLE "DeskAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "targetDesk" TEXT NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "assigneeName" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "reassignmentLog" JSONB,
    CONSTRAINT "DeskAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeskAssignment_applicationId_idx" ON "DeskAssignment"("applicationId");
CREATE INDEX "DeskAssignment_assigneeUserId_idx" ON "DeskAssignment"("assigneeUserId");
CREATE INDEX "DeskAssignment_targetDesk_idx" ON "DeskAssignment"("targetDesk");
ALTER TABLE "DeskAssignment" ADD CONSTRAINT "DeskAssignment_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
