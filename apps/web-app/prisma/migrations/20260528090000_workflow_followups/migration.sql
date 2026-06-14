-- Workflow fine-tune follow-ups (2026-05-28)
-- - Stage 2 RT explicit handoff state (separate from Kol data entry)
-- - Legal document fail reason
-- - Decision checkpoint freezes web-research citations
-- - Proposed agenda item routing reason (Stage 5 P2)

ALTER TABLE "Application"
  ADD COLUMN "stage2SlikApproval" JSONB;

-- Existing applications already beyond Stage 2 must have passed the legacy SLIK/Kol handoff.
UPDATE "Application"
SET "stage2SlikApproval" = '{"verifiedByRT":true}'::jsonb
WHERE "stage" >= 3 AND "kolEntered" = true AND "stage2SlikApproval" IS NULL;

ALTER TABLE "ApplicationDocument"
  ADD COLUMN "legalVerificationReason" TEXT;

ALTER TABLE "DecisionCheckpoint"
  ADD COLUMN "exploredSources" JSONB;

ALTER TABLE "MeetingAgendaItem"
  ADD COLUMN "routingReason" TEXT;
