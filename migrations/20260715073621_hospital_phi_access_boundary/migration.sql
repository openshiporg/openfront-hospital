-- Hash-only intake bearer storage, explicit global-clinical permission, and
-- patient/provider/facility ownership relationships.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add the ownership columns before backfilling existing runtime/demo rows.
ALTER TABLE "Appointment" ADD COLUMN "facility" TEXT;
ALTER TABLE "Encounter" ADD COLUMN "facility" TEXT;

-- Add bearer lifecycle fields without dropping plaintext until every row has
-- a digest. Existing completed forms are marked consumed; active forms receive
-- a bounded seven-day migration window.
ALTER TABLE "IntakeForm"
ADD COLUMN "accessCodeHash" TEXT,
ADD COLUMN "accessExpiresAt" TIMESTAMP(3),
ADD COLUMN "accessRevokedAt" TIMESTAMP(3),
ADD COLUMN "accessUsedAt" TIMESTAMP(3);

UPDATE "IntakeForm"
SET
  "accessCodeHash" = encode(digest("accessCode", 'sha256'), 'hex'),
  "accessExpiresAt" = CASE
    WHEN "status" IN ('submitted', 'reviewed')
      THEN COALESCE("submittedAt", "updatedAt", CURRENT_TIMESTAMP)
    ELSE CURRENT_TIMESTAMP + INTERVAL '7 days'
  END,
  "accessUsedAt" = CASE
    WHEN "status" IN ('submitted', 'reviewed')
      THEN COALESCE("submittedAt", "updatedAt", CURRENT_TIMESTAMP)
    ELSE NULL
  END;

ALTER TABLE "IntakeForm" ALTER COLUMN "accessExpiresAt" SET NOT NULL;
DROP INDEX "IntakeForm_accessCode_key";
ALTER TABLE "IntakeForm" DROP COLUMN "accessCode";

ALTER TABLE "Role" ADD COLUMN "canAccessAllClinicalData" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the existing all-capability administrator while making every other
-- role scoped by default.
UPDATE "Role"
SET "canAccessAllClinicalData" = true
WHERE "canManageRoles" = true
  AND "canManagePeople" = true
  AND "canManageOnboarding" = true;

CREATE TABLE "_Facility_staff" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE TABLE "_Facility_providers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE TABLE "_Facility_patients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_Facility_staff_AB_unique" ON "_Facility_staff"("A", "B");
CREATE INDEX "_Facility_staff_B_index" ON "_Facility_staff"("B");
CREATE UNIQUE INDEX "_Facility_providers_AB_unique" ON "_Facility_providers"("A", "B");
CREATE INDEX "_Facility_providers_B_index" ON "_Facility_providers"("B");
CREATE UNIQUE INDEX "_Facility_patients_AB_unique" ON "_Facility_patients"("A", "B");
CREATE INDEX "_Facility_patients_B_index" ON "_Facility_patients"("B");

-- Provider scope follows the existing primary-location business key.
INSERT INTO "_Facility_providers" ("A", "B")
SELECT f."id", p."id"
FROM "Facility" f
JOIN "Provider" p ON p."locationName" = f."name"
ON CONFLICT DO NOTHING;

-- Appointment scope follows its location first and its provider's facility as
-- a fallback for historical rows.
UPDATE "Appointment" a
SET "facility" = f."id"
FROM "Facility" f
WHERE a."facility" IS NULL
  AND a."locationName" = f."name";

UPDATE "Appointment" a
SET "facility" = pf."A"
FROM "_Facility_providers" pf
WHERE a."facility" IS NULL
  AND a."provider" = pf."B";

-- Patients inherit every facility represented by their existing appointments.
INSERT INTO "_Facility_patients" ("A", "B")
SELECT DISTINCT a."facility", a."patient"
FROM "Appointment" a
WHERE a."facility" IS NOT NULL
  AND a."patient" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Encounter scope follows its appointment, then its provider, then a linked
-- department facility for standalone historical encounters.
UPDATE "Encounter" e
SET "facility" = a."facility"
FROM "Appointment" a
WHERE e."facility" IS NULL
  AND e."appointment" = a."id"
  AND a."facility" IS NOT NULL;

UPDATE "Encounter" e
SET "facility" = pf."A"
FROM "_Facility_providers" pf
WHERE e."facility" IS NULL
  AND e."provider" = pf."B";

UPDATE "Encounter" e
SET "facility" = scoped."facilityId"
FROM (
  SELECT df."A" AS "departmentId", MIN(df."B") AS "facilityId"
  FROM "_Department_facilities" df
  GROUP BY df."A"
) scoped
WHERE e."facility" IS NULL
  AND e."department" = scoped."departmentId";

CREATE INDEX "Appointment_facility_idx" ON "Appointment"("facility");
CREATE INDEX "Encounter_facility_idx" ON "Encounter"("facility");
CREATE UNIQUE INDEX "IntakeForm_accessCodeHash_key" ON "IntakeForm"("accessCodeHash");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "_Facility_staff" ADD CONSTRAINT "_Facility_staff_A_fkey" FOREIGN KEY ("A") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_Facility_staff" ADD CONSTRAINT "_Facility_staff_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_Facility_providers" ADD CONSTRAINT "_Facility_providers_A_fkey" FOREIGN KEY ("A") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_Facility_providers" ADD CONSTRAINT "_Facility_providers_B_fkey" FOREIGN KEY ("B") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_Facility_patients" ADD CONSTRAINT "_Facility_patients_A_fkey" FOREIGN KEY ("A") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_Facility_patients" ADD CONSTRAINT "_Facility_patients_B_fkey" FOREIGN KEY ("B") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
