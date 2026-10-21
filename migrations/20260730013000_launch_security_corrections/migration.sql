-- Forward-only launch security corrections. The prior operational-fabric
-- migration is already applied and remains immutable.

-- Replica-shared, digest-only request counters. Raw addresses, installation
-- keys, cookies, and bearer credentials are never stored in this table.
CREATE TABLE "RequestRateLimitBucket" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequestRateLimitBucket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestRateLimitBucket_count_check" CHECK ("count" >= 1)
);
CREATE INDEX "RequestRateLimitBucket_updatedAt_idx" ON "RequestRateLimitBucket"("updatedAt");

-- Internal events are an atomic ledger, not transport acknowledgements.
ALTER TABLE "ClinicalOutboxEvent" ALTER COLUMN "status" SET DEFAULT 'recorded';
ALTER TABLE "ClinicalOutboxEvent" DROP CONSTRAINT "ClinicalOutboxEvent_status_check";
ALTER TABLE "ClinicalOutboxEvent"
  ADD CONSTRAINT "ClinicalOutboxEvent_status_check"
  CHECK ("status" IN ('recorded','pending','processing','retry','delivered','dead_letter'));
UPDATE "ClinicalOutboxEvent"
SET "status" = 'recorded', "attempts" = 0, "nextAttemptAt" = NULL,
    "deliveredAt" = NULL, "lastError" = ''
WHERE "deliveryMode" = 'internal';

-- Public requests remain staff-review inbox items and do not reserve provider
-- inventory. Confirmation still takes the provider lock and exclusion guard.
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_active_provider_no_overlap";
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_active_provider_no_overlap"
  EXCLUDE USING gist (
    "provider" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (
    "provider" IS NOT NULL
    AND "status" IN ('confirmed', 'checked_in', 'in_visit')
  );

-- Migration 20260715073621 inferred global PHI access from broad administrative
-- flags. Replace that inference with one explicitly reviewed administrator.
-- Existing deployments with a different reviewed owner can pass
-- `options=-c openfront.reviewed_global_admin_email=<email>` in DATABASE_URL.
-- Ambiguous upgrades abort rather than guessing or preserving broad grants.
DO $$
DECLARE
  global_count integer;
  reviewed_email text := COALESCE(
    NULLIF(current_setting('openfront.reviewed_global_admin_email', true), ''),
    'hospital@openship.org'
  );
  reviewed_role_count integer;
  reviewed_role_id text;
BEGIN
  SELECT count(*) INTO global_count
  FROM "Role"
  WHERE "canAccessAllClinicalData" = true;

  IF global_count > 0 THEN
    SELECT count(DISTINCT role_row."id"), min(role_row."id")
      INTO reviewed_role_count, reviewed_role_id
    FROM "Role" role_row
    JOIN "User" user_row ON user_row."role" = role_row."id"
    WHERE role_row."canAccessAllClinicalData" = true
      AND lower(user_row."email") = lower(reviewed_email);

    IF reviewed_role_count <> 1 THEN
      RAISE EXCEPTION
        'Global clinical access review required: expected exactly one global role for reviewed administrator %',
        reviewed_email;
    END IF;

    UPDATE "Role"
    SET "canAccessAllClinicalData" = false
    WHERE "canAccessAllClinicalData" = true
      AND "id" <> reviewed_role_id;
  END IF;
END $$;

-- The historical Telehealth backfill cross-joined providers when more than one
-- virtual facility existed. Exact canonical "Telehealth" rows were repaired by
-- 20260718223000. Any other ambiguous retained row now stops migration so an
-- operator can map or quarantine it explicitly; no arbitrary facility is used.
DO $$
DECLARE
  ambiguous_provider text;
BEGIN
  SELECT provider."id" INTO ambiguous_provider
  FROM "Provider" provider
  JOIN "_Facility_providers" link ON link."B" = provider."id"
  JOIN "Facility" facility ON facility."id" = link."A"
  WHERE lower(provider."locationName") LIKE '%telehealth%'
    AND facility."facilityType" = 'telehealth'
  GROUP BY provider."id"
  HAVING count(DISTINCT facility."id") > 1
  LIMIT 1;

  IF ambiguous_provider IS NOT NULL THEN
    RAISE EXCEPTION
      'Ambiguous historical telehealth ownership requires explicit review for provider %',
      ambiguous_provider;
  END IF;
END $$;

-- Bed facility ownership must match the immutable room -> ward -> department
-- chain. Validate retained rows before installing the write-time guard.
DO $$
DECLARE
  mismatched_bed text;
BEGIN
  SELECT bed."id" INTO mismatched_bed
  FROM "Bed" bed
  WHERE NOT EXISTS (
    SELECT 1
    FROM "Room" room
    JOIN "Ward" ward ON ward."id" = room."ward"
    JOIN "_Department_facilities" link ON link."A" = ward."department"
    WHERE room."id" = bed."room" AND link."B" = bed."facility"
  )
  LIMIT 1;

  IF mismatched_bed IS NOT NULL THEN
    RAISE EXCEPTION 'Bed facility chain requires explicit review for bed %', mismatched_bed;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "enforce_bed_facility_chain"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Room" room
    JOIN "Ward" ward ON ward."id" = room."ward"
    JOIN "_Department_facilities" link ON link."A" = ward."department"
    WHERE room."id" = NEW."room" AND link."B" = NEW."facility"
  ) THEN
    RAISE EXCEPTION 'Bed room and facility do not share an authorized department chain';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Bed_facility_chain_guard"
BEFORE INSERT OR UPDATE OF "room", "facility" ON "Bed"
FOR EACH ROW EXECUTE FUNCTION "enforce_bed_facility_chain"();
