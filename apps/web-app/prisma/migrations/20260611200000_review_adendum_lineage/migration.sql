-- P5 · Topic 7 — review/adendum lineage + cadence. ADDITIVE nullable columns + a self-relation FK.
-- sourceApplicationId = the prior-cycle app a review/adendum child points at (original = null).
-- disbursedAt = the disbursement DATE (cadence anchor, set at 5→6 Cair). Customer.reviewCadenceMonths = Nasabah override.
-- Reversible: DROP the columns/constraint. Mizan records, never monitors — the cadence anchor is a DATE, never a payment signal.
ALTER TABLE "Application" ADD COLUMN "sourceApplicationId" TEXT;
ALTER TABLE "Application" ADD COLUMN "disbursedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "reviewCadenceMonths" INTEGER;
CREATE INDEX "Application_sourceApplicationId_idx" ON "Application"("sourceApplicationId");
ALTER TABLE "Application" ADD CONSTRAINT "Application_sourceApplicationId_fkey"
    FOREIGN KEY ("sourceApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
