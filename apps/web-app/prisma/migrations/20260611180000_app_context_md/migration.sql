-- P4-A · Topic 5 — Application.contextMd (the app-scoped sacred human "Catatan"; AUTO block derived live).
-- ADDITIVE nullable column, no backfill. Customer.contextMd already exists (P1). Reversible: DROP COLUMN.
ALTER TABLE "Application" ADD COLUMN "contextMd" TEXT;
