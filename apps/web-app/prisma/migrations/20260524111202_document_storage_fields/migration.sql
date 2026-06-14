-- AlterTable
ALTER TABLE "ApplicationDocument" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "storageKey" TEXT;
