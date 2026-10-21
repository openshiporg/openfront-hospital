-- Historical demo rows used "Telehealth" as a provider location before the
-- canonical virtual-care facility name existed. Complete ownership backfill
-- using bounded facility-type semantics, then propagate scope to dependents.
INSERT INTO "_Facility_providers" ("A", "B")
SELECT f."id", p."id"
FROM "Provider" p
JOIN "Facility" f
  ON lower(p."locationName") LIKE '%telehealth%'
 AND f."facilityType" = 'telehealth'
WHERE NOT EXISTS (
  SELECT 1 FROM "_Facility_providers" existing WHERE existing."B" = p."id"
)
ON CONFLICT DO NOTHING;

UPDATE "Appointment" a
SET "facility" = pf."A"
FROM "_Facility_providers" pf
WHERE a."facility" IS NULL
  AND a."provider" = pf."B";

INSERT INTO "_Facility_patients" ("A", "B")
SELECT DISTINCT a."facility", a."patient"
FROM "Appointment" a
WHERE a."facility" IS NOT NULL
  AND a."patient" IS NOT NULL
ON CONFLICT DO NOTHING;

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
