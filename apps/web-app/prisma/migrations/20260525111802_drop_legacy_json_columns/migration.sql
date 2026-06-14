-- Contract step of the JSONB→relational refactor. The data in these columns was
-- backfilled into the new tables (ConversationMessage / MeetingAgendaItem / MeetingAttendee)
-- by migration 20260525041146_jsonb_to_relational_tables and verified 1:1 before this drop.
ALTER TABLE "Application" DROP COLUMN "aiChatHistory";
ALTER TABLE "Application" DROP COLUMN "aiAssistantLog";
ALTER TABLE "KomiteMeeting" DROP COLUMN "agendaAppIds";
ALTER TABLE "KomiteMeeting" DROP COLUMN "attendeeUserIds";
