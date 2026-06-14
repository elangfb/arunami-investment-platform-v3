-- P3-E1 · N2 (ADR-0018): MUAP minted by an explicit RM action, not auto — DocLinkage.muapDocId nullable
-- (null until generated). Widening only — existing rows all have a value, no backfill. Mirrors rskDocId.
ALTER TABLE "DocLinkage" ALTER COLUMN "muapDocId" DROP NOT NULL;
