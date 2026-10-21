-- Encounter workflow integrity: idempotent opening, direct tenancy, optimistic
-- transitions, and one encounter per appointment. Existing rows are retained.

ALTER TABLE "Encounter"
  ADD COLUMN "actorReference" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "operationKeyHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "requestHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "transitionVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "Encounter"
SET
  "actorReference" = 'migration_backfill',
  "operationKeyHash" = encode(digest('legacy:encounter:' || "id", 'sha256'), 'hex'),
  "requestHash" = encode(digest('legacy:encounter-payload:' || "id", 'sha256'), 'hex')
WHERE "operationKeyHash" = '' OR "requestHash" = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Encounter"
    WHERE "status" IS NULL OR "patient" IS NULL OR "provider" IS NULL OR "facility" IS NULL
  ) THEN
    RAISE EXCEPTION 'Encounter workflow migration requires patient, provider, facility, and status on every retained row';
  END IF;
  IF EXISTS (
    SELECT "appointment" FROM "Encounter"
    WHERE "appointment" IS NOT NULL
    GROUP BY "appointment"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Encounter workflow migration found more than one encounter for an appointment';
  END IF;
END $$;

ALTER TABLE "Encounter"
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "patient" SET NOT NULL,
  ALTER COLUMN "provider" SET NOT NULL,
  ALTER COLUMN "facility" SET NOT NULL,
  ADD CONSTRAINT "Encounter_workflow_evidence_check" CHECK (
    length("operationKeyHash") = 64 AND
    length("requestHash") = 64 AND
    "transitionVersion" >= 1
  );

CREATE UNIQUE INDEX "Encounter_operationKeyHash_key" ON "Encounter"("operationKeyHash");
CREATE UNIQUE INDEX "Encounter_appointment_key" ON "Encounter"("appointment");

ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_patient_fkey";
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_provider_fkey";
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_facility_fkey";

ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patient_fkey"
  FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_provider_fkey"
  FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_facility_fkey"
  FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_encounter_identity"() RETURNS trigger AS $$
BEGIN
  IF
    NEW."operationKeyHash" IS DISTINCT FROM OLD."operationKeyHash" OR
    NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR
    NEW."patient" IS DISTINCT FROM OLD."patient" OR
    NEW."provider" IS DISTINCT FROM OLD."provider" OR
    NEW."facility" IS DISTINCT FROM OLD."facility" OR
    NEW."appointment" IS DISTINCT FROM OLD."appointment" OR
    NEW."department" IS DISTINCT FROM OLD."department"
  THEN
    RAISE EXCEPTION 'Encounter identity and tenancy are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Encounter_identity_guard"
BEFORE UPDATE ON "Encounter"
FOR EACH ROW EXECUTE FUNCTION "protect_encounter_identity"();
