-- AlterTable
ALTER TABLE "DecisionCheckpoint" ADD COLUMN     "riskDsrMaxPct" INTEGER,
ADD COLUMN     "riskKolMax" INTEGER,
ADD COLUMN     "riskLtvMaxPct" INTEGER,
ADD COLUMN     "riskPolicyVersion" INTEGER;
