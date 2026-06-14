-- P3-D · structured deliverables (design §4). ADDITIVE nullable columns; no backfill.
-- appraisalRecord = structured Penilaian ({path,nilaiPasar,nilaiLikuidasi,penilai,tanggalLaporan,reportDocId})
-- kept ALONGSIDE the existing scalar appraisalPath (gate reads it). originType: null = 'original' (code default).
-- Reversible: DROP COLUMN restores prior state.
ALTER TABLE "Application" ADD COLUMN "appraisalRecord" JSONB;
ALTER TABLE "Application" ADD COLUMN "originType" TEXT;
