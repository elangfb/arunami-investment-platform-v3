-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaItem" (
    "meetingId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("meetingId","applicationId")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("meetingId","userId")
);

-- CreateIndex
CREATE INDEX "ConversationMessage_applicationId_surface_seq_idx" ON "ConversationMessage"("applicationId", "surface", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_applicationId_surface_seq_key" ON "ConversationMessage"("applicationId", "surface", "seq");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_applicationId_idx" ON "MeetingAgendaItem"("applicationId");

-- CreateIndex
CREATE INDEX "MeetingAttendee_userId_idx" ON "MeetingAttendee"("userId");

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "KomiteMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "KomiteMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- DATA BACKFILL (expand step of expand→contract). Move JSON arrays into the new
-- relational tables. The old columns (aiChatHistory, aiAssistantLog, agendaAppIds,
-- attendeeUserIds) are KEPT here and dropped in a later migration once code is cut over.
-- Message-row order is preserved via array ordinality → seq. createdAt is backfilled to
-- now() (the JSON elements never carried a per-message timestamp).
-- ─────────────────────────────────────────────────────────────────────────────

-- Discussion thread (Application.aiChatHistory → ConversationMessage surface='discussion')
INSERT INTO "ConversationMessage" ("id", "applicationId", "surface", "seq", "role", "content", "createdAt")
SELECT gen_random_uuid()::text, a."id", 'discussion', (t.ord - 1)::int, t.elem->>'role', t.elem->>'content', CURRENT_TIMESTAMP
FROM "Application" a
CROSS JOIN LATERAL jsonb_array_elements(a."aiChatHistory") WITH ORDINALITY AS t(elem, ord)
WHERE jsonb_typeof(a."aiChatHistory") = 'array'
  AND t.elem->>'role' IS NOT NULL
  AND t.elem->>'content' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Risk-assistant thread (Application.aiAssistantLog → ConversationMessage surface='assistant')
INSERT INTO "ConversationMessage" ("id", "applicationId", "surface", "seq", "role", "content", "createdAt")
SELECT gen_random_uuid()::text, a."id", 'assistant', (t.ord - 1)::int, t.elem->>'role', t.elem->>'content', CURRENT_TIMESTAMP
FROM "Application" a
CROSS JOIN LATERAL jsonb_array_elements(a."aiAssistantLog") WITH ORDINALITY AS t(elem, ord)
WHERE jsonb_typeof(a."aiAssistantLog") = 'array'
  AND t.elem->>'role' IS NOT NULL
  AND t.elem->>'content' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Meeting agenda (KomiteMeeting.agendaAppIds → MeetingAgendaItem). Orphan app ids (which the
-- JSON array tolerated) are skipped — a real FK cannot hold them.
INSERT INTO "MeetingAgendaItem" ("meetingId", "applicationId")
SELECT m."id", elem
FROM "KomiteMeeting" m
CROSS JOIN LATERAL jsonb_array_elements_text(m."agendaAppIds") AS elem
WHERE jsonb_typeof(m."agendaAppIds") = 'array'
  AND EXISTS (SELECT 1 FROM "Application" a WHERE a."id" = elem)
ON CONFLICT DO NOTHING;

-- Meeting attendees (KomiteMeeting.attendeeUserIds → MeetingAttendee). Orphan user ids skipped.
INSERT INTO "MeetingAttendee" ("meetingId", "userId")
SELECT m."id", elem
FROM "KomiteMeeting" m
CROSS JOIN LATERAL jsonb_array_elements_text(m."attendeeUserIds") AS elem
WHERE jsonb_typeof(m."attendeeUserIds") = 'array'
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = elem)
ON CONFLICT DO NOTHING;
