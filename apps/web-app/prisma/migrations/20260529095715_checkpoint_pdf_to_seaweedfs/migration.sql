-- AlterTable
ALTER TABLE "DecisionCheckpoint" ADD COLUMN     "muapSizeBytes" INTEGER,
ADD COLUMN     "muapStorageKey" TEXT,
ADD COLUMN     "rskSizeBytes" INTEGER,
ADD COLUMN     "rskStorageKey" TEXT,
ALTER COLUMN "muapPdf" DROP NOT NULL,
ALTER COLUMN "rskPdf" DROP NOT NULL;
