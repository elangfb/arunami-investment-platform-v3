-- AlterTable
ALTER TABLE "KomiteMeeting" ADD COLUMN     "meetingUrl" TEXT,
ALTER COLUMN "room" DROP NOT NULL;

-- Backfill: the old "Virtual (Zoom)" fake-room rows become real online meetings
-- (no physical room + a join link). Modality is now implicit from these fields.
UPDATE "KomiteMeeting"
SET "room" = NULL, "meetingUrl" = 'https://zoom.us/j/9876543210'
WHERE "room" = 'Virtual (Zoom)';
