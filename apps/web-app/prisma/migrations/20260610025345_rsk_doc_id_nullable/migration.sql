-- Batch 3 T3: RSK Doc is created at Stage-4 entry, not with the MUAP. rskDocId is null until then.
ALTER TABLE "DocLinkage" ALTER COLUMN "rskDocId" DROP NOT NULL;
