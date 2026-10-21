-- Batch 3 hospital source controls.
--
-- This forward-only migration is deliberately explicit rather than accepting
-- Prisma's unsafe required-column draft. It preserves retained rows, backfills
-- known synthetic onboarding identities, refuses to guess a time zone for an
-- unknown retained facility, and makes audit/consent/PHI-read evidence
-- append-only at the database boundary.

-- Stable setup keys are nullable for records not owned by deterministic setup.
ALTER TABLE "Clinician" ADD COLUMN "onboardingKey" TEXT;
ALTER TABLE "Provider" ADD COLUMN "onboardingKey" TEXT;

UPDATE "Provider"
SET "onboardingKey" = CASE
  WHEN "firstName" = 'Maya' AND "lastName" = 'Patel' THEN 'provider-maya-patel'
  WHEN "firstName" = 'Elliot' AND "lastName" = 'Chen' THEN 'provider-elliot-chen'
  WHEN "firstName" = 'Priya' AND "lastName" = 'Shah' THEN 'provider-priya-shah'
  ELSE "onboardingKey"
END
WHERE "onboardingKey" IS NULL;

UPDATE "Clinician"
SET "onboardingKey" = CASE
  WHEN "displayName" = 'Maya Patel, MD' THEN 'clinician-maya-patel'
  WHEN "displayName" = 'Elliot Chen, NP' THEN 'clinician-elliot-chen'
  WHEN "displayName" = 'Priya Shah, LCSW' THEN 'clinician-priya-shah'
  ELSE "onboardingKey"
END
WHERE "onboardingKey" IS NULL;

-- Facility-local scheduling must not silently inherit the database/server zone.
ALTER TABLE "Facility" ADD COLUMN "timeZone" TEXT;
UPDATE "Facility" SET "timeZone" = 'America/Los_Angeles'
WHERE "slug" IN ('northstar-downtown-clinic', 'northstar-virtual-care');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Facility" WHERE "timeZone" IS NULL) THEN
    RAISE EXCEPTION 'Every retained facility requires an explicitly reviewed IANA time zone';
  END IF;
END $$;
ALTER TABLE "Facility" ALTER COLUMN "timeZone" SET NOT NULL;
ALTER TABLE "Facility" ALTER COLUMN "timeZone" SET DEFAULT 'UTC';
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_timeZone_nonempty" CHECK (length("timeZone") BETWEEN 1 AND 100);

-- Existing consent rows are historical grants. Preserve their original grant
-- time as the effective time rather than stamping migration time.
ALTER TABLE "PatientConsent"
  ADD COLUMN "decision" TEXT,
  ADD COLUMN "effectiveAt" TIMESTAMP(3),
  ADD COLUMN "operationKeyHash" TEXT,
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "supersedes" TEXT;
UPDATE "PatientConsent"
SET "decision" = 'granted',
    "effectiveAt" = COALESCE("grantedAt", "createdAt"),
    "reasonCode" = '';
ALTER TABLE "PatientConsent" ALTER COLUMN "decision" SET NOT NULL;
ALTER TABLE "PatientConsent" ALTER COLUMN "decision" SET DEFAULT 'granted';
ALTER TABLE "PatientConsent" ALTER COLUMN "effectiveAt" SET NOT NULL;
ALTER TABLE "PatientConsent" ALTER COLUMN "effectiveAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PatientConsent" ALTER COLUMN "reasonCode" SET NOT NULL;
ALTER TABLE "PatientConsent" ALTER COLUMN "reasonCode" SET DEFAULT '';
ALTER TABLE "PatientConsent" ALTER COLUMN "grantedAt" DROP NOT NULL;
ALTER TABLE "PatientConsent" ALTER COLUMN "grantedAt" DROP DEFAULT;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_decision_check"
  CHECK ("decision" IN ('granted', 'declined', 'withdrawn'));

-- Existing medication rows predate source-basis capture. Do not invent an
-- external prescriber or reconciliation event; mark the basis honestly as
-- legacy/unspecified. New workflow writes reject this legacy value.
ALTER TABLE "Prescription" ADD COLUMN "recordingBasis" TEXT;
UPDATE "Prescription" SET "recordingBasis" = 'legacy_unspecified';
ALTER TABLE "Prescription" ALTER COLUMN "recordingBasis" SET NOT NULL;
ALTER TABLE "Prescription" ALTER COLUMN "status" SET DEFAULT 'recorded_manual';
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_recordingBasis_check"
  CHECK ("recordingBasis" IN ('external_record', 'manual_reconciliation', 'legacy_unspecified'));

-- Preserve legacy integer temperatures while exposing precise tenths for all
-- new writes.
ALTER TABLE "VitalSign" ADD COLUMN "temperatureTenthsC" INTEGER;
ALTER TABLE "VitalSign" DISABLE TRIGGER "VitalSign_immutable";
UPDATE "VitalSign"
SET "temperatureTenthsC" = "temperatureC" * 10
WHERE "temperatureC" IS NOT NULL;
ALTER TABLE "VitalSign" ENABLE TRIGGER "VitalSign_immutable";

CREATE TABLE "HospitalProfile" (
    "id" TEXT NOT NULL,
    "profileKey" TEXT NOT NULL DEFAULT 'primary',
    "status" TEXT NOT NULL DEFAULT 'active',
    "name" TEXT NOT NULL DEFAULT '',
    "shortName" TEXT NOT NULL DEFAULT '',
    "market" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "locationName" TEXT NOT NULL DEFAULT '',
    "serviceArea" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "supportPhone" TEXT NOT NULL DEFAULT '',
    "supportEmail" TEXT NOT NULL DEFAULT '',
    "media" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HospitalProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhiReadAudit" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'phi.read',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "operationName" TEXT NOT NULL DEFAULT '',
    "rootFields" JSONB,
    "selectedFields" JSONB,
    "selectionDigest" TEXT NOT NULL DEFAULT '',
    "resultReferenceDigest" TEXT NOT NULL DEFAULT '',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PhiReadAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhiReadAudit_resultCount_check" CHECK ("resultCount" >= 0)
);

CREATE UNIQUE INDEX "HospitalProfile_profileKey_key" ON "HospitalProfile"("profileKey");
CREATE INDEX "PhiReadAudit_selectionDigest_idx" ON "PhiReadAudit"("selectionDigest");
CREATE UNIQUE INDEX "Clinician_onboardingKey_key" ON "Clinician"("onboardingKey");
CREATE UNIQUE INDEX "PatientConsent_operationKeyHash_key" ON "PatientConsent"("operationKeyHash");
CREATE UNIQUE INDEX "PatientConsent_supersedes_key" ON "PatientConsent"("supersedes");
CREATE UNIQUE INDEX "Provider_onboardingKey_key" ON "Provider"("onboardingKey");

ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_supersedes_fkey"
  FOREIGN KEY ("supersedes") REFERENCES "PatientConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "reject_batch3_append_only_evidence"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% evidence is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ClinicalAuditLog_append_only" BEFORE UPDATE OR DELETE ON "ClinicalAuditLog"
  FOR EACH ROW EXECUTE FUNCTION "reject_batch3_append_only_evidence"();
CREATE TRIGGER "PatientConsent_append_only" BEFORE UPDATE OR DELETE ON "PatientConsent"
  FOR EACH ROW EXECUTE FUNCTION "reject_batch3_append_only_evidence"();
CREATE TRIGGER "PhiReadAudit_append_only" BEFORE UPDATE OR DELETE ON "PhiReadAudit"
  FOR EACH ROW EXECUTE FUNCTION "reject_batch3_append_only_evidence"();

CREATE OR REPLACE FUNCTION "protect_prescription_recording_basis"() RETURNS trigger AS $$
BEGIN
  IF NEW."recordingBasis" IS DISTINCT FROM OLD."recordingBasis" THEN
    RAISE EXCEPTION 'Prescription recording basis is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Prescription_recording_basis_guard" BEFORE UPDATE ON "Prescription"
  FOR EACH ROW EXECUTE FUNCTION "protect_prescription_recording_basis"();
