-- Fold the legacy split RM roles into a single Relationship Manager role.
--   account-officer (intake/slik/pencairan) + loan-analyst (muap-author)
--     -> relationship-manager (intake/slik/muap-author/pencairan)
-- AO is legacy; the RM role absorbs MUAP authoring so the RM persona (Siti) can draft the
-- MUAP — it was stranded on the separate loan-analyst role. Data-only and idempotent.

-- 1. Rename the legacy account-officer role key -> relationship-manager.
UPDATE "Role" SET "key" = 'relationship-manager', "name" = 'Relationship Manager'
WHERE "key" = 'account-officer';

-- 2. Grant muap-author to the RM role (composite PK on (roleId, desk) guards duplicates).
INSERT INTO "RoleDesk" ("roleId", "desk")
SELECT r."id", 'muap-author' FROM "Role" r WHERE r."key" = 'relationship-manager'
ON CONFLICT ("roleId", "desk") DO NOTHING;

-- 3. Re-point loan-analyst grants onto the RM role. First drop any grant that would collide
--    with an existing RM grant (UserRole PK is (userId, roleId)), then move the rest.
DELETE FROM "UserRole" ur
USING "Role" la, "Role" rm
WHERE ur."roleId" = la."id" AND la."key" = 'loan-analyst' AND rm."key" = 'relationship-manager'
  AND EXISTS (SELECT 1 FROM "UserRole" u2 WHERE u2."userId" = ur."userId" AND u2."roleId" = rm."id");

UPDATE "UserRole" ur SET "roleId" = rm."id"
FROM "Role" la, "Role" rm
WHERE ur."roleId" = la."id" AND la."key" = 'loan-analyst' AND rm."key" = 'relationship-manager';

-- 4. Remove the now-empty loan-analyst role (its RoleDesk rows cascade on delete).
DELETE FROM "Role" WHERE "key" = 'loan-analyst';
