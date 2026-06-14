-- P4-C · ADR-0019 — generated docs Mizan-owned + shortcut into the user folder. ADDITIVE nullable columns.
-- Application.mizanDocFolderId = the Mizan-owned folder holding this app's generated docs (≠ driveFolderId,
-- the user's source folder). DocLinkage.shortcutWarning = the per-app shortcut-placement outcome (Bahasa
-- warning when a shortcut 403s; cleared on success). Reversible: DROP COLUMN.
ALTER TABLE "Application" ADD COLUMN "mizanDocFolderId" TEXT;
ALTER TABLE "DocLinkage" ADD COLUMN "shortcutWarning" TEXT;
