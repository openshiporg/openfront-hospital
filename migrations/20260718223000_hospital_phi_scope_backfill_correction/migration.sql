-- Preserve the checksum of the already-applied scope backfill and narrow its
-- historical Northstar "Telehealth" mapping with an additive correction.
-- Only the exact legacy location key and canonical Northstar facility slug are
-- eligible; unrelated facilities and provider locations are left untouched.

INSERT INTO "_Facility_providers" ("A", "B")
SELECT canonical."id", p."id"
FROM "Provider" p
JOIN "Facility" canonical ON canonical."slug" = 'northstar-virtual-care'
WHERE lower(trim(p."locationName")) = 'telehealth'
ON CONFLICT DO NOTHING;

UPDATE "Appointment" a
SET "facility" = canonical."id"
FROM "Provider" p, "Facility" current_facility, "Facility" canonical
WHERE a."provider" = p."id"
  AND a."facility" = current_facility."id"
  AND canonical."slug" = 'northstar-virtual-care'
  AND lower(trim(p."locationName")) = 'telehealth'
  AND current_facility."facilityType" = 'telehealth'
  AND current_facility."id" <> canonical."id";

UPDATE "Encounter" e
SET "facility" = canonical."id"
FROM "Appointment" a, "Provider" p, "Facility" canonical
WHERE e."appointment" = a."id"
  AND a."provider" = p."id"
  AND a."facility" = canonical."id"
  AND canonical."slug" = 'northstar-virtual-care'
  AND lower(trim(p."locationName")) = 'telehealth'
  AND (
    e."facility" IS NULL
    OR e."facility" IN (
      SELECT linked_facility."id"
      FROM "Facility" linked_facility
      WHERE linked_facility."facilityType" = 'telehealth'
        AND linked_facility."id" <> canonical."id"
    )
  );

UPDATE "Encounter" e
SET "facility" = canonical."id"
FROM "Provider" p, "Facility" canonical
WHERE e."appointment" IS NULL
  AND e."provider" = p."id"
  AND canonical."slug" = 'northstar-virtual-care'
  AND lower(trim(p."locationName")) = 'telehealth'
  AND (
    e."facility" IS NULL
    OR e."facility" IN (
      SELECT linked_facility."id"
      FROM "Facility" linked_facility
      WHERE linked_facility."facilityType" = 'telehealth'
        AND linked_facility."id" <> canonical."id"
    )
  );

INSERT INTO "_Facility_patients" ("A", "B")
SELECT DISTINCT a."facility", a."patient"
FROM "Appointment" a
WHERE a."facility" IS NOT NULL
  AND a."patient" IS NOT NULL
ON CONFLICT DO NOTHING;

DELETE FROM "_Facility_providers" link
USING "Provider" p, "Facility" linked_facility, "Facility" canonical
WHERE link."B" = p."id"
  AND link."A" = linked_facility."id"
  AND canonical."slug" = 'northstar-virtual-care'
  AND lower(trim(p."locationName")) = 'telehealth'
  AND linked_facility."facilityType" = 'telehealth'
  AND linked_facility."id" <> canonical."id"
  AND EXISTS (
    SELECT 1
    FROM "_Facility_providers" canonical_link
    WHERE canonical_link."A" = canonical."id"
      AND canonical_link."B" = p."id"
  );

DELETE FROM "_Facility_patients" link
USING "Facility" linked_facility
WHERE link."A" = linked_facility."id"
  AND linked_facility."facilityType" = 'telehealth'
  AND linked_facility."slug" <> 'northstar-virtual-care'
  AND EXISTS (
    SELECT 1
    FROM "Appointment" target_appointment
    JOIN "Provider" target_provider ON target_provider."id" = target_appointment."provider"
    WHERE target_appointment."patient" = link."B"
      AND lower(trim(target_provider."locationName")) = 'telehealth'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Appointment" retained_appointment
    WHERE retained_appointment."patient" = link."B"
      AND retained_appointment."facility" = link."A"
  );
