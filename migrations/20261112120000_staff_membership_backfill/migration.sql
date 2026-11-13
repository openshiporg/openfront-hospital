-- Give staff users (a role, no patient account) who have no facility membership the oldest active facility.
INSERT INTO "_Facility_staff" ("A", "B")
SELECT f."id", u."id"
FROM "User" u
CROSS JOIN LATERAL (
  SELECT "id" FROM "Facility" WHERE "status" = 'active' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
) f
WHERE u."role" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Patient" p WHERE p."user" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "_Facility_staff" fs WHERE fs."B" = u."id");
