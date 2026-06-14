-- Stage 5 P1 foundation (workflow-finetune.md §8). KomiteMeeting gains nullable
-- auto-materialization metadata; MeetingScheduleTemplateVersion is the versioned-config
-- holder. status enum is documented (Prisma String — accepts 'proposed' / 'cancelled' now).

ALTER TABLE "KomiteMeeting"
  ADD COLUMN "sourceTemplateId" TEXT,
  ADD COLUMN "scheduledDate" TIMESTAMP(3),
  ADD COLUMN "slotCapacity" INTEGER;

-- Idempotency for the daily auto-materializer: (template, date) is unique. Safe to add now
-- because both columns are null on every existing row.
CREATE UNIQUE INDEX "KomiteMeeting_sourceTemplateId_scheduledDate_key"
  ON "KomiteMeeting"("sourceTemplateId", "scheduledDate");

CREATE INDEX "KomiteMeeting_status_idx" ON "KomiteMeeting"("status");

CREATE TABLE "MeetingScheduleTemplateVersion" (
  "version" INTEGER NOT NULL,
  "templates" JSONB NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingScheduleTemplateVersion_pkey" PRIMARY KEY ("version")
);
