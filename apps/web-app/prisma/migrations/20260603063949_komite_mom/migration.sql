-- AlterTable
ALTER TABLE "KomiteMeeting" ADD COLUMN     "minutes" TEXT,
ADD COLUMN     "minutesRecordedAt" TIMESTAMP(3),
ADD COLUMN     "minutesRecordedBy" TEXT;
