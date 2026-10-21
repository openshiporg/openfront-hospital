-- Launch operational fabric and direct facility ownership.
-- Existing rows are backfilled deterministically; ambiguous scope aborts instead of guessing.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Admission" DROP CONSTRAINT IF EXISTS "Admission_attendingProvider_fkey";
ALTER TABLE "Admission" DROP CONSTRAINT IF EXISTS "Admission_bed_fkey";
ALTER TABLE "Admission" DROP CONSTRAINT IF EXISTS "Admission_facility_fkey";
ALTER TABLE "Admission" DROP CONSTRAINT IF EXISTS "Admission_patient_fkey";
ALTER TABLE "Admission" DROP CONSTRAINT IF EXISTS "Admission_room_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_facility_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_patient_fkey";
ALTER TABLE "BedOccupancyEvent" DROP CONSTRAINT IF EXISTS "BedOccupancyEvent_bed_fkey";
ALTER TABLE "BedOccupancyEvent" DROP CONSTRAINT IF EXISTS "BedOccupancyEvent_facility_fkey";
ALTER TABLE "CarePlan" DROP CONSTRAINT IF EXISTS "CarePlan_facility_fkey";
ALTER TABLE "CarePlan" DROP CONSTRAINT IF EXISTS "CarePlan_patient_fkey";
ALTER TABLE "CarePlan" DROP CONSTRAINT IF EXISTS "CarePlan_provider_fkey";
ALTER TABLE "ClinicalOutboxEvent" DROP CONSTRAINT IF EXISTS "ClinicalOutboxEvent_patient_fkey";
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT IF EXISTS "InsuranceClaim_encounter_fkey";
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT IF EXISTS "InsuranceClaim_facility_fkey";
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT IF EXISTS "InsuranceClaim_patient_fkey";
ALTER TABLE "LabResult" DROP CONSTRAINT IF EXISTS "LabResult_encounter_fkey";
ALTER TABLE "LabResult" DROP CONSTRAINT IF EXISTS "LabResult_facility_fkey";
ALTER TABLE "LabResult" DROP CONSTRAINT IF EXISTS "LabResult_labTest_fkey";
ALTER TABLE "LabResult" DROP CONSTRAINT IF EXISTS "LabResult_medicalOrder_fkey";
ALTER TABLE "LabResult" DROP CONSTRAINT IF EXISTS "LabResult_patient_fkey";
ALTER TABLE "MedicalOrder" DROP CONSTRAINT IF EXISTS "MedicalOrder_encounter_fkey";
ALTER TABLE "MedicalOrder" DROP CONSTRAINT IF EXISTS "MedicalOrder_facility_fkey";
ALTER TABLE "MedicalOrder" DROP CONSTRAINT IF EXISTS "MedicalOrder_orderingProvider_fkey";
ALTER TABLE "MedicalOrder" DROP CONSTRAINT IF EXISTS "MedicalOrder_patient_fkey";
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_portalAccess_fkey";
ALTER TABLE "Prescription" DROP CONSTRAINT IF EXISTS "Prescription_encounter_fkey";
ALTER TABLE "Prescription" DROP CONSTRAINT IF EXISTS "Prescription_facility_fkey";
ALTER TABLE "Prescription" DROP CONSTRAINT IF EXISTS "Prescription_patient_fkey";
ALTER TABLE "Prescription" DROP CONSTRAINT IF EXISTS "Prescription_provider_fkey";
ALTER TABLE "Procedure" DROP CONSTRAINT IF EXISTS "Procedure_encounter_fkey";
ALTER TABLE "Procedure" DROP CONSTRAINT IF EXISTS "Procedure_facility_fkey";
ALTER TABLE "Procedure" DROP CONSTRAINT IF EXISTS "Procedure_patient_fkey";
ALTER TABLE "Procedure" DROP CONSTRAINT IF EXISTS "Procedure_provider_fkey";
ALTER TABLE "VitalSign" DROP CONSTRAINT IF EXISTS "VitalSign_encounter_fkey";
ALTER TABLE "VitalSign" DROP CONSTRAINT IF EXISTS "VitalSign_patient_fkey";
ALTER TABLE "VitalSign" DROP CONSTRAINT IF EXISTS "VitalSign_recordedBy_fkey";
DROP INDEX IF EXISTS "Patient_portalAccess_key";

ALTER TABLE "Appointment" ADD COLUMN "transitionVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Bed" ADD COLUMN "facility" TEXT, ADD COLUMN "transitionVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CareQueueTicket" ADD COLUMN "queueDate" TEXT NOT NULL DEFAULT '', ADD COLUMN "queuePosition" INTEGER;
ALTER TABLE "ClinicalAuditLog" ADD COLUMN "facility" TEXT;
ALTER TABLE "ClinicalOutboxEvent" ADD COLUMN "contractVersion" TEXT NOT NULL DEFAULT 'hospital.event.v1', ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'internal', ADD COLUMN "installation" TEXT, ALTER COLUMN "patient" DROP NOT NULL;
ALTER TABLE "InsuranceClaim" ADD COLUMN "coverage" TEXT;
ALTER TABLE "IntakeForm" ADD COLUMN "facility" TEXT, ADD COLUMN "operationKeyHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "requestHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "transitionVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PatientConsent" ADD COLUMN "facility" TEXT;
ALTER TABLE "PatientMessage" ADD COLUMN "facility" TEXT, ADD COLUMN "installation" TEXT, ADD COLUMN "operationKeyHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'care_operations', ADD COLUMN "requestHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "template" TEXT, ADD COLUMN "transitionVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PatientPortalAccess" ADD COLUMN "facility" TEXT, ADD COLUMN "inviteExpiresAt" TIMESTAMP(3), ADD COLUMN "inviteRevokedAt" TIMESTAMP(3), ADD COLUMN "inviteUsedAt" TIMESTAMP(3), ADD COLUMN "operationKeyHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "patient" TEXT, ADD COLUMN "requestHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProviderScheduleBlock" ADD COLUMN "facility" TEXT;
ALTER TABLE "Role" ADD COLUMN "canManageBilling" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "canManageDataPortability" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "canManageIntegrations" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "canManageInventory" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "canManageRetention" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VitalSign" ADD COLUMN "actorReference" TEXT NOT NULL DEFAULT '', ADD COLUMN "facility" TEXT, ADD COLUMN "operationKeyHash" TEXT NOT NULL DEFAULT '', ADD COLUMN "requestHash" TEXT NOT NULL DEFAULT '';

-- Preserve the old one-to-one portal relationship while moving ownership to the portal row.
UPDATE "PatientPortalAccess" portal
SET "patient" = patient."id"
FROM "Patient" patient
WHERE patient."portalAccess" = portal."id" AND portal."patient" IS NULL;

-- Existing schedule blocks use an exact provider location match first, then a single-facility provider fallback.
UPDATE "ProviderScheduleBlock" block
SET "facility" = facility."id"
FROM "Provider" provider
JOIN "_Facility_providers" fp ON fp."B" = provider."id"
JOIN "Facility" facility ON facility."id" = fp."A" AND facility."name" = provider."locationName"
WHERE block."provider" = provider."id" AND block."facility" IS NULL;
WITH single_facility AS (
  SELECT fp."B" AS provider_id, MIN(fp."A") AS facility_id
  FROM "_Facility_providers" fp GROUP BY fp."B" HAVING COUNT(*) = 1
)
UPDATE "ProviderScheduleBlock" block SET "facility" = scope.facility_id
FROM single_facility scope WHERE block."provider" = scope.provider_id AND block."facility" IS NULL;

-- Direct facility ownership follows the record's own appointment/encounter/registration first.
UPDATE "IntakeForm" intake SET "facility" = appointment."facility"
FROM "Appointment" appointment WHERE intake."appointment" = appointment."id" AND intake."facility" IS NULL;
UPDATE "PatientMessage" message SET "facility" = appointment."facility"
FROM "Appointment" appointment WHERE message."appointment" = appointment."id" AND message."facility" IS NULL;
UPDATE "PatientConsent" consent SET "facility" = appointment."facility"
FROM "Appointment" appointment WHERE consent."appointment" = appointment."id" AND consent."facility" IS NULL;
UPDATE "PatientConsent" consent SET "facility" = intake."facility"
FROM "IntakeForm" intake WHERE consent."intakeForm" = intake."id" AND consent."facility" IS NULL;
UPDATE "PatientConsent" consent SET "facility" = registration."facility"
FROM "PatientRegistration" registration WHERE registration."consent" = consent."id" AND consent."facility" IS NULL;
UPDATE "ClinicalAuditLog" audit SET "facility" = appointment."facility"
FROM "Appointment" appointment WHERE audit."appointment" = appointment."id" AND audit."facility" IS NULL;
UPDATE "ClinicalAuditLog" audit SET "facility" = intake."facility"
FROM "IntakeForm" intake WHERE audit."intakeForm" = intake."id" AND audit."facility" IS NULL;
UPDATE "ClinicalAuditLog" audit SET "facility" = encounter."facility"
FROM "Encounter" encounter WHERE audit."encounter" = encounter."id" AND audit."facility" IS NULL;
UPDATE "ClinicalAuditLog" audit SET "facility" = registration."facility"
FROM "PatientRegistration" registration WHERE registration."auditLog" = audit."id" AND audit."facility" IS NULL;

-- A patient-derived fallback is allowed only when exactly one facility owns the patient.
WITH single_facility AS (
  SELECT fp."B" AS patient_id, MIN(fp."A") AS facility_id
  FROM "_Facility_patients" fp GROUP BY fp."B" HAVING COUNT(*) = 1
)
UPDATE "IntakeForm" intake SET "facility" = scope.facility_id
FROM single_facility scope WHERE intake."patient" = scope.patient_id AND intake."facility" IS NULL;
WITH single_facility AS (
  SELECT fp."B" AS patient_id, MIN(fp."A") AS facility_id
  FROM "_Facility_patients" fp GROUP BY fp."B" HAVING COUNT(*) = 1
)
UPDATE "PatientMessage" message SET "facility" = scope.facility_id
FROM single_facility scope WHERE message."patient" = scope.patient_id AND message."facility" IS NULL;
WITH single_facility AS (
  SELECT fp."B" AS patient_id, MIN(fp."A") AS facility_id
  FROM "_Facility_patients" fp GROUP BY fp."B" HAVING COUNT(*) = 1
)
UPDATE "PatientConsent" consent SET "facility" = scope.facility_id
FROM single_facility scope WHERE consent."patient" = scope.patient_id AND consent."facility" IS NULL;
WITH single_facility AS (
  SELECT fp."B" AS patient_id, MIN(fp."A") AS facility_id
  FROM "_Facility_patients" fp GROUP BY fp."B" HAVING COUNT(*) = 1
)
UPDATE "ClinicalAuditLog" audit SET "facility" = scope.facility_id
FROM single_facility scope WHERE audit."patient" = scope.patient_id AND audit."facility" IS NULL;
WITH single_facility AS (
  SELECT fp."B" AS patient_id, MIN(fp."A") AS facility_id
  FROM "_Facility_patients" fp GROUP BY fp."B" HAVING COUNT(*) = 1
)
UPDATE "PatientPortalAccess" portal SET "facility" = scope.facility_id
FROM single_facility scope WHERE portal."patient" = scope.patient_id AND portal."facility" IS NULL;

-- Beds inherit a facility only from an unambiguous department-facility relationship.
WITH bed_scope AS (
  SELECT bed."id" AS bed_id, MIN(df."B") AS facility_id
  FROM "Bed" bed
  JOIN "Room" room ON room."id" = bed."room"
  JOIN "Ward" ward ON ward."id" = room."ward"
  JOIN "_Department_facilities" df ON df."A" = ward."department"
  GROUP BY bed."id" HAVING COUNT(*) = 1
)
UPDATE "Bed" bed SET "facility" = scope.facility_id FROM bed_scope scope WHERE bed."id" = scope.bed_id;
UPDATE "BedOccupancyEvent" event SET "facility" = admission."facility"
FROM "Admission" admission WHERE event."admission" = admission."id" AND event."facility" IS NULL;
UPDATE "BedOccupancyEvent" event SET "facility" = bed."facility"
FROM "Bed" bed WHERE event."bed" = bed."id" AND event."facility" IS NULL;

UPDATE "VitalSign" vital
SET "facility" = encounter."facility",
    "operationKeyHash" = encode(digest('legacy:vital:' || vital."id", 'sha256'), 'hex'),
    "requestHash" = encode(digest('legacy:vital-payload:' || vital."id", 'sha256'), 'hex'),
    "actorReference" = 'migration_backfill'
FROM "Encounter" encounter
WHERE vital."encounter" = encounter."id";

-- Retained lab results without an originating order receive a deterministic migration order.
-- The fact trigger is suspended only for this additive relationship repair and restored immediately.
INSERT INTO "MedicalOrder" (
  "id", "orderNumber", "orderType", "status", "patient", "encounter", "orderingProvider",
  "summary", "orderedAt", "completedAt", "facility", "operationKeyHash", "requestHash",
  "transitionVersion", "actorReference", "createdAt", "updatedAt"
)
SELECT
  'migration-order-' || result."id",
  'MIGRATED-' || result."resultNumber",
  'lab',
  'completed',
  result."patient",
  result."encounter",
  encounter."provider",
  'Retained laboratory result linkage',
  COALESCE(result."resultedAt", result."createdAt"),
  COALESCE(result."resultedAt", result."createdAt"),
  result."facility",
  encode(digest('migration:lab-order:' || result."id", 'sha256'), 'hex'),
  encode(digest('migration:lab-order-payload:' || result."id", 'sha256'), 'hex'),
  1,
  'migration_backfill',
  result."createdAt",
  result."updatedAt"
FROM "LabResult" result
JOIN "Encounter" encounter ON encounter."id" = result."encounter"
WHERE result."medicalOrder" IS NULL
ON CONFLICT ("id") DO NOTHING;

DROP TRIGGER IF EXISTS "LabResult_fact_guard" ON "LabResult";
UPDATE "LabResult" result
SET "medicalOrder" = 'migration-order-' || result."id"
WHERE result."medicalOrder" IS NULL;
CREATE TRIGGER "LabResult_fact_guard" BEFORE UPDATE ON "LabResult" FOR EACH ROW EXECUTE FUNCTION "protect_lab_result_fact"();

INSERT INTO "ClinicalAuditLog" (
  "id", "eventType", "occurredAt", "actorType", "actorReference", "facility", "patient", "encounter", "metadata", "createdAt"
)
SELECT
  'migration-audit-lab-order-' || result."id",
  'medical_order.migration_linked',
  CURRENT_TIMESTAMP,
  'system_migration',
  'migration_backfill',
  result."facility",
  result."patient",
  result."encounter",
  jsonb_build_object('source', 'launch_operational_fabric_migration', 'aggregateType', 'medical_order', 'aggregateId', 'migration-order-' || result."id", 'status', 'completed', 'transitionVersion', 1),
  CURRENT_TIMESTAMP
FROM "LabResult" result
WHERE result."medicalOrder" = 'migration-order-' || result."id"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ClinicalOutboxEvent" (
  "id", "eventKey", "eventType", "aggregateType", "aggregateId", "deliveryMode", "status", "attempts", "nextAttemptAt", "facility", "patient", "encounter", "payload", "createdAt"
)
SELECT
  'migration-outbox-lab-order-' || result."id",
  'medical_order:migration-order-' || result."id" || ':v1:completed',
  'medical_order.migration_linked',
  'medical_order',
  'migration-order-' || result."id",
  'internal',
  'pending',
  0,
  CURRENT_TIMESTAMP,
  result."facility",
  result."patient",
  result."encounter",
  jsonb_build_object('source', 'launch_operational_fabric_migration', 'aggregateType', 'medical_order', 'aggregateId', 'migration-order-' || result."id", 'status', 'completed', 'transitionVersion', 1),
  CURRENT_TIMESTAMP
FROM "LabResult" result
WHERE result."medicalOrder" = 'migration-order-' || result."id"
ON CONFLICT ("eventKey") DO NOTHING;

-- Stable legacy evidence supports uniqueness without retaining bearer material.
UPDATE "IntakeForm" SET
  "operationKeyHash" = encode(digest('legacy:intake:' || "id", 'sha256'), 'hex'),
  "requestHash" = encode(digest('legacy:intake-payload:' || "id", 'sha256'), 'hex')
WHERE "operationKeyHash" = '' OR "requestHash" = '';
UPDATE "PatientMessage" SET
  "operationKeyHash" = encode(digest('legacy:message:' || "id", 'sha256'), 'hex'),
  "requestHash" = encode(digest('legacy:message-payload:' || "id", 'sha256'), 'hex')
WHERE "operationKeyHash" = '' OR "requestHash" = '';
UPDATE "PatientPortalAccess" SET
  "operationKeyHash" = encode(digest('legacy:portal:' || "id", 'sha256'), 'hex'),
  "requestHash" = encode(digest('legacy:portal-payload:' || "id", 'sha256'), 'hex'),
  "inviteExpiresAt" = COALESCE("inviteExpiresAt", "invitedAt" + INTERVAL '72 hours')
WHERE "operationKeyHash" = '' OR "requestHash" = '' OR "inviteExpiresAt" IS NULL;

-- Deterministic queue positions are unique per facility and UTC arrival date.
WITH ranked AS (
  SELECT "id", to_char("arrivedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS queue_date,
         row_number() OVER (PARTITION BY "facility", ("arrivedAt" AT TIME ZONE 'UTC')::date ORDER BY "arrivedAt", "id") AS queue_position
  FROM "CareQueueTicket"
)
UPDATE "CareQueueTicket" ticket
SET "queueDate" = ranked.queue_date, "queuePosition" = ranked.queue_position
FROM ranked WHERE ticket."id" = ranked."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Admission" WHERE "patient" IS NULL OR "attendingProvider" IS NULL OR "room" IS NULL OR "bed" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Admission required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "Appointment" WHERE "patient" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Appointment required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "Bed" WHERE "facility" IS NULL) THEN RAISE EXCEPTION 'Bed facility scope is ambiguous or missing'; END IF;
  IF EXISTS (SELECT 1 FROM "BedOccupancyEvent" WHERE "facility" IS NULL OR "bed" IS NULL) THEN RAISE EXCEPTION 'Bed occupancy scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "CarePlan" WHERE "patient" IS NULL OR "provider" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Care plan required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "CareQueueTicket" WHERE "queuePosition" IS NULL OR "queueDate" = '') THEN RAISE EXCEPTION 'Care queue position backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "ClinicalAuditLog" WHERE "facility" IS NULL) THEN RAISE EXCEPTION 'Clinical audit facility scope is ambiguous or missing'; END IF;
  IF EXISTS (SELECT 1 FROM "InsuranceClaim" WHERE "patient" IS NULL OR "encounter" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Claim required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "IntakeForm" WHERE "patient" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Intake facility scope is ambiguous or missing'; END IF;
  IF EXISTS (SELECT 1 FROM "LabResult" WHERE "patient" IS NULL OR "encounter" IS NULL OR "labTest" IS NULL OR "facility" IS NULL OR "medicalOrder" IS NULL) THEN RAISE EXCEPTION 'Lab result required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "MedicalOrder" WHERE "patient" IS NULL OR "encounter" IS NULL OR "orderingProvider" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Medical order required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "PatientConsent" WHERE "patient" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Consent facility scope is ambiguous or missing'; END IF;
  IF EXISTS (SELECT 1 FROM "PatientMessage" WHERE "patient" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Message facility scope is ambiguous or missing'; END IF;
  IF EXISTS (SELECT 1 FROM "PatientPortalAccess" WHERE "patient" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Portal facility scope is ambiguous or missing'; END IF;
  IF EXISTS (SELECT 1 FROM "Prescription" WHERE "patient" IS NULL OR "provider" IS NULL OR "encounter" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Prescription required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "Procedure" WHERE "patient" IS NULL OR "provider" IS NULL OR "encounter" IS NULL OR "facility" IS NULL) THEN RAISE EXCEPTION 'Procedure required scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "ProviderScheduleBlock" WHERE "facility" IS NULL) THEN RAISE EXCEPTION 'Provider schedule block facility scope is ambiguous or missing'; END IF;
  IF EXISTS (SELECT 1 FROM "VitalSign" WHERE "facility" IS NULL OR "patient" IS NULL OR "encounter" IS NULL OR "recordedBy" IS NULL OR "recordedAt" IS NULL) THEN RAISE EXCEPTION 'Vital sign scope backfill is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM "PatientPortalAccess" GROUP BY "facility", "patient" HAVING COUNT(*) > 1) THEN RAISE EXCEPTION 'Duplicate facility patient portal access requires review'; END IF;
END;
$$;

ALTER TABLE "Admission" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "attendingProvider" SET NOT NULL, ALTER COLUMN "room" SET NOT NULL, ALTER COLUMN "bed" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "Bed" ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "BedOccupancyEvent" ALTER COLUMN "facility" SET NOT NULL, ALTER COLUMN "bed" SET NOT NULL;
ALTER TABLE "CarePlan" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "provider" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "CareQueueTicket" ALTER COLUMN "queuePosition" SET NOT NULL;
ALTER TABLE "ClinicalAuditLog" ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "InsuranceClaim" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "encounter" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "IntakeForm" ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "LabResult" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "encounter" SET NOT NULL, ALTER COLUMN "labTest" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL, ALTER COLUMN "medicalOrder" SET NOT NULL;
ALTER TABLE "MedicalOrder" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "encounter" SET NOT NULL, ALTER COLUMN "orderingProvider" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "PatientConsent" ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "PatientMessage" ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "PatientPortalAccess" ALTER COLUMN "facility" SET NOT NULL, ALTER COLUMN "patient" SET NOT NULL;
ALTER TABLE "Prescription" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "provider" SET NOT NULL, ALTER COLUMN "encounter" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "Procedure" ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "encounter" SET NOT NULL, ALTER COLUMN "provider" SET NOT NULL, ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "ProviderScheduleBlock" ALTER COLUMN "facility" SET NOT NULL;
ALTER TABLE "VitalSign" ALTER COLUMN "facility" SET NOT NULL, ALTER COLUMN "patient" SET NOT NULL, ALTER COLUMN "encounter" SET NOT NULL, ALTER COLUMN "recordedBy" SET NOT NULL, ALTER COLUMN "recordedAt" SET NOT NULL;
ALTER TABLE "Patient" DROP COLUMN "portalAccess";

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT,
    "auditLog" TEXT,
    "outboxEvent" TEXT,
    "result" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCoverage" (
    "id" TEXT NOT NULL,
    "coverageNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "payerName" TEXT NOT NULL DEFAULT '',
    "memberId" TEXT NOT NULL DEFAULT '',
    "groupNumber" TEXT NOT NULL DEFAULT '',
    "effectiveAt" TIMESTAMP(3),
    "terminatesAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimVersion" (
    "id" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT '',
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "coverage" TEXT,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPayment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "claim" TEXT,
    "installation" TEXT,
    "amountCents" INTEGER NOT NULL,
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientRefund" (
    "id" TEXT NOT NULL,
    "refundNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "payment" TEXT NOT NULL,
    "installation" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "externalReference" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "movementNumber" TEXT NOT NULL DEFAULT '',
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "movementType" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "resultingOnHand" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "resultingReserved" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "prescription" TEXT,
    "procedure" TEXT,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationPreference" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'allowed',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "changedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationTemplate" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "subjectTemplate" TEXT NOT NULL DEFAULT '',
    "bodyTemplate" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedReservation" (
    "id" TEXT NOT NULL,
    "reservationNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "bed" TEXT NOT NULL,
    "admission" TEXT,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationInstallation" (
    "id" TEXT NOT NULL,
    "installationKey" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "endpointUrl" TEXT NOT NULL DEFAULT '',
    "allowedEventTypes" JSONB,
    "signingSecretCiphertext" TEXT NOT NULL DEFAULT '',
    "signingSecretIv" TEXT NOT NULL DEFAULT '',
    "signingSecretTag" TEXT NOT NULL DEFAULT '',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "keyPrefix" TEXT NOT NULL DEFAULT '',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "secretDigest" TEXT NOT NULL DEFAULT '',
    "scopes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "facility" TEXT NOT NULL,
    "installation" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedFingerprint" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MachineCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "attemptKey" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "installation" TEXT NOT NULL,
    "outboxEvent" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "responseDigest" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookReceipt" (
    "id" TEXT NOT NULL,
    "receiptKey" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "requestDigest" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "facility" TEXT NOT NULL,
    "installation" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorCode" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "IntegrationWebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDocument" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "encounter" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "supersedes" TEXT,
    "documentType" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "signedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specimen" (
    "id" TEXT NOT NULL,
    "specimenNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'collected',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "encounter" TEXT NOT NULL,
    "medicalOrder" TEXT NOT NULL,
    "specimenType" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "disposedAt" TIMESTAMP(3),
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Specimen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL DEFAULT '',
    "retentionDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionDisposition" (
    "id" TEXT NOT NULL,
    "dispositionNumber" TEXT NOT NULL DEFAULT '',
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT,
    "policy" TEXT NOT NULL,
    "recordType" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordHold" (
    "id" TEXT NOT NULL,
    "holdNumber" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL DEFAULT '',
    "importType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "sourceHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "preview" JSONB,
    "appliedIds" JSONB,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "appliedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL DEFAULT '',
    "exportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB,
    "objectKey" TEXT NOT NULL DEFAULT '',
    "resultDigest" TEXT NOT NULL DEFAULT '',
    "accessTokenDigest" TEXT NOT NULL DEFAULT '',
    "resultCiphertext" TEXT NOT NULL DEFAULT '',
    "resultIv" TEXT NOT NULL DEFAULT '',
    "resultTag" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentityLink" (
    "id" TEXT NOT NULL,
    "linkNumber" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "system" TEXT NOT NULL DEFAULT '',
    "resourceType" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "localType" TEXT NOT NULL DEFAULT '',
    "localId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTransition_operationKeyHash_key" ON "WorkflowTransition"("operationKeyHash");

-- CreateIndex
CREATE INDEX "WorkflowTransition_aggregateId_idx" ON "WorkflowTransition"("aggregateId");

-- CreateIndex
CREATE INDEX "WorkflowTransition_facility_idx" ON "WorkflowTransition"("facility");

-- CreateIndex
CREATE INDEX "WorkflowTransition_patient_idx" ON "WorkflowTransition"("patient");

-- CreateIndex
CREATE INDEX "WorkflowTransition_auditLog_idx" ON "WorkflowTransition"("auditLog");

-- CreateIndex
CREATE INDEX "WorkflowTransition_outboxEvent_idx" ON "WorkflowTransition"("outboxEvent");

-- CreateIndex
CREATE UNIQUE INDEX "PatientCoverage_coverageNumber_key" ON "PatientCoverage"("coverageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientCoverage_operationKeyHash_key" ON "PatientCoverage"("operationKeyHash");

-- CreateIndex
CREATE INDEX "PatientCoverage_facility_idx" ON "PatientCoverage"("facility");

-- CreateIndex
CREATE INDEX "PatientCoverage_patient_idx" ON "PatientCoverage"("patient");

-- CreateIndex
CREATE INDEX "PatientCoverage_verifiedBy_idx" ON "PatientCoverage"("verifiedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimVersion_versionKey_key" ON "ClaimVersion"("versionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimVersion_operationKeyHash_key" ON "ClaimVersion"("operationKeyHash");

-- CreateIndex
CREATE INDEX "ClaimVersion_facility_idx" ON "ClaimVersion"("facility");

-- CreateIndex
CREATE INDEX "ClaimVersion_patient_idx" ON "ClaimVersion"("patient");

-- CreateIndex
CREATE INDEX "ClaimVersion_claim_idx" ON "ClaimVersion"("claim");

-- CreateIndex
CREATE INDEX "ClaimVersion_coverage_idx" ON "ClaimVersion"("coverage");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPayment_paymentNumber_key" ON "PatientPayment"("paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPayment_operationKeyHash_key" ON "PatientPayment"("operationKeyHash");

-- CreateIndex
CREATE INDEX "PatientPayment_facility_idx" ON "PatientPayment"("facility");

-- CreateIndex
CREATE INDEX "PatientPayment_patient_idx" ON "PatientPayment"("patient");

-- CreateIndex
CREATE INDEX "PatientPayment_claim_idx" ON "PatientPayment"("claim");

-- CreateIndex
CREATE INDEX "PatientPayment_installation_idx" ON "PatientPayment"("installation");

-- CreateIndex
CREATE INDEX "PatientPayment_externalReference_idx" ON "PatientPayment"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "PatientRefund_refundNumber_key" ON "PatientRefund"("refundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientRefund_operationKeyHash_key" ON "PatientRefund"("operationKeyHash");

-- CreateIndex
CREATE INDEX "PatientRefund_facility_idx" ON "PatientRefund"("facility");

-- CreateIndex
CREATE INDEX "PatientRefund_patient_idx" ON "PatientRefund"("patient");

-- CreateIndex
CREATE INDEX "PatientRefund_payment_idx" ON "PatientRefund"("payment");

-- CreateIndex
CREATE INDEX "PatientRefund_installation_idx" ON "PatientRefund"("installation");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_operationKeyHash_key" ON "InventoryItem"("operationKeyHash");

-- CreateIndex
CREATE INDEX "InventoryItem_facility_idx" ON "InventoryItem"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_facility_sku_key" ON "InventoryItem"("facility", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_movementNumber_key" ON "InventoryMovement"("movementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_operationKeyHash_key" ON "InventoryMovement"("operationKeyHash");

-- CreateIndex
CREATE INDEX "InventoryMovement_facility_idx" ON "InventoryMovement"("facility");

-- CreateIndex
CREATE INDEX "InventoryMovement_item_idx" ON "InventoryMovement"("item");

-- CreateIndex
CREATE INDEX "InventoryMovement_prescription_idx" ON "InventoryMovement"("prescription");

-- CreateIndex
CREATE INDEX "InventoryMovement_procedure_idx" ON "InventoryMovement"("procedure");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreference_operationKeyHash_key" ON "CommunicationPreference"("operationKeyHash");

-- CreateIndex
CREATE INDEX "CommunicationPreference_facility_idx" ON "CommunicationPreference"("facility");

-- CreateIndex
CREATE INDEX "CommunicationPreference_patient_idx" ON "CommunicationPreference"("patient");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreference_scope_key" ON "CommunicationPreference"("facility", "patient", "channel", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTemplate_operationKeyHash_key" ON "CommunicationTemplate"("operationKeyHash");

-- CreateIndex
CREATE INDEX "CommunicationTemplate_facility_idx" ON "CommunicationTemplate"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTemplate_facility_key" ON "CommunicationTemplate"("facility", "templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "BedReservation_reservationNumber_key" ON "BedReservation"("reservationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BedReservation_operationKeyHash_key" ON "BedReservation"("operationKeyHash");

-- CreateIndex
CREATE INDEX "BedReservation_facility_idx" ON "BedReservation"("facility");

-- CreateIndex
CREATE INDEX "BedReservation_patient_idx" ON "BedReservation"("patient");

-- CreateIndex
CREATE INDEX "BedReservation_bed_idx" ON "BedReservation"("bed");

-- CreateIndex
CREATE INDEX "BedReservation_admission_idx" ON "BedReservation"("admission");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationInstallation_installationKey_key" ON "IntegrationInstallation"("installationKey");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationInstallation_operationKeyHash_key" ON "IntegrationInstallation"("operationKeyHash");

-- CreateIndex
CREATE INDEX "IntegrationInstallation_facility_idx" ON "IntegrationInstallation"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationInstallation_facility_key" ON "IntegrationInstallation"("facility", "installationKey");

-- CreateIndex
CREATE UNIQUE INDEX "MachineCredential_keyPrefix_key" ON "MachineCredential"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "MachineCredential_secretDigest_key" ON "MachineCredential"("secretDigest");

-- CreateIndex
CREATE UNIQUE INDEX "MachineCredential_operationKeyHash_key" ON "MachineCredential"("operationKeyHash");

-- CreateIndex
CREATE INDEX "MachineCredential_facility_idx" ON "MachineCredential"("facility");

-- CreateIndex
CREATE INDEX "MachineCredential_installation_idx" ON "MachineCredential"("installation");

-- CreateIndex
CREATE INDEX "MachineCredential_createdBy_idx" ON "MachineCredential"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDeliveryAttempt_attemptKey_key" ON "IntegrationDeliveryAttempt"("attemptKey");

-- CreateIndex
CREATE INDEX "IntegrationDeliveryAttempt_facility_idx" ON "IntegrationDeliveryAttempt"("facility");

-- CreateIndex
CREATE INDEX "IntegrationDeliveryAttempt_installation_idx" ON "IntegrationDeliveryAttempt"("installation");

-- CreateIndex
CREATE INDEX "IntegrationDeliveryAttempt_outboxEvent_idx" ON "IntegrationDeliveryAttempt"("outboxEvent");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDeliveryAttempt_event_attempt_key" ON "IntegrationDeliveryAttempt"("outboxEvent", "installation", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookReceipt_receiptKey_key" ON "IntegrationWebhookReceipt"("receiptKey");

-- CreateIndex
CREATE INDEX "IntegrationWebhookReceipt_facility_idx" ON "IntegrationWebhookReceipt"("facility");

-- CreateIndex
CREATE INDEX "IntegrationWebhookReceipt_installation_idx" ON "IntegrationWebhookReceipt"("installation");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalDocument_documentNumber_key" ON "ClinicalDocument"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalDocument_operationKeyHash_key" ON "ClinicalDocument"("operationKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalDocument_supersedes_key" ON "ClinicalDocument"("supersedes");

-- CreateIndex
CREATE INDEX "ClinicalDocument_facility_idx" ON "ClinicalDocument"("facility");

-- CreateIndex
CREATE INDEX "ClinicalDocument_patient_idx" ON "ClinicalDocument"("patient");

-- CreateIndex
CREATE INDEX "ClinicalDocument_encounter_idx" ON "ClinicalDocument"("encounter");

-- CreateIndex
CREATE INDEX "ClinicalDocument_author_idx" ON "ClinicalDocument"("author");

-- CreateIndex
CREATE INDEX "ClinicalDocument_signedBy_idx" ON "ClinicalDocument"("signedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Specimen_specimenNumber_key" ON "Specimen"("specimenNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Specimen_operationKeyHash_key" ON "Specimen"("operationKeyHash");

-- CreateIndex
CREATE INDEX "Specimen_facility_idx" ON "Specimen"("facility");

-- CreateIndex
CREATE INDEX "Specimen_patient_idx" ON "Specimen"("patient");

-- CreateIndex
CREATE INDEX "Specimen_encounter_idx" ON "Specimen"("encounter");

-- CreateIndex
CREATE INDEX "Specimen_medicalOrder_idx" ON "Specimen"("medicalOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_operationKeyHash_key" ON "RetentionPolicy"("operationKeyHash");

-- CreateIndex
CREATE INDEX "RetentionPolicy_facility_idx" ON "RetentionPolicy"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_facility_record_key" ON "RetentionPolicy"("facility", "recordType");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionDisposition_dispositionNumber_key" ON "RetentionDisposition"("dispositionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionDisposition_operationKeyHash_key" ON "RetentionDisposition"("operationKeyHash");

-- CreateIndex
CREATE INDEX "RetentionDisposition_facility_idx" ON "RetentionDisposition"("facility");

-- CreateIndex
CREATE INDEX "RetentionDisposition_patient_idx" ON "RetentionDisposition"("patient");

-- CreateIndex
CREATE INDEX "RetentionDisposition_policy_idx" ON "RetentionDisposition"("policy");

-- CreateIndex
CREATE INDEX "RetentionDisposition_aggregateId_idx" ON "RetentionDisposition"("aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordHold_holdNumber_key" ON "RecordHold"("holdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RecordHold_operationKeyHash_key" ON "RecordHold"("operationKeyHash");

-- CreateIndex
CREATE INDEX "RecordHold_aggregateId_idx" ON "RecordHold"("aggregateId");

-- CreateIndex
CREATE INDEX "RecordHold_facility_idx" ON "RecordHold"("facility");

-- CreateIndex
CREATE INDEX "RecordHold_patient_idx" ON "RecordHold"("patient");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_batchNumber_key" ON "ImportBatch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_operationKeyHash_key" ON "ImportBatch"("operationKeyHash");

-- CreateIndex
CREATE INDEX "ImportBatch_facility_idx" ON "ImportBatch"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_jobNumber_key" ON "ExportJob"("jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_operationKeyHash_key" ON "ExportJob"("operationKeyHash");

-- CreateIndex
CREATE INDEX "ExportJob_facility_idx" ON "ExportJob"("facility");

-- CreateIndex
CREATE INDEX "ExportJob_requestedBy_idx" ON "ExportJob"("requestedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentityLink_linkNumber_key" ON "ExternalIdentityLink"("linkNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentityLink_operationKeyHash_key" ON "ExternalIdentityLink"("operationKeyHash");

-- CreateIndex
CREATE INDEX "ExternalIdentityLink_facility_idx" ON "ExternalIdentityLink"("facility");

-- CreateIndex
CREATE INDEX "ExternalIdentityLink_localId_idx" ON "ExternalIdentityLink"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentityLink_external_key" ON "ExternalIdentityLink"("facility", "system", "resourceType", "externalId");

-- CreateIndex
CREATE INDEX "ProviderScheduleBlock_facility_idx" ON "ProviderScheduleBlock"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "VitalSign_operationKeyHash_key" ON "VitalSign"("operationKeyHash");

-- CreateIndex
CREATE INDEX "VitalSign_facility_idx" ON "VitalSign"("facility");

-- CreateIndex
CREATE INDEX "Bed_facility_idx" ON "Bed"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "CareQueueTicket_facility_queue_position_key" ON "CareQueueTicket"("facility", "queueDate", "queuePosition");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_facility_idx" ON "ClinicalAuditLog"("facility");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_deliveryMode_idx" ON "ClinicalOutboxEvent"("deliveryMode");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_installation_idx" ON "ClinicalOutboxEvent"("installation");

-- CreateIndex
CREATE INDEX "InsuranceClaim_coverage_idx" ON "InsuranceClaim"("coverage");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeForm_operationKeyHash_key" ON "IntakeForm"("operationKeyHash");

-- CreateIndex
CREATE INDEX "IntakeForm_facility_idx" ON "IntakeForm"("facility");

-- CreateIndex
CREATE INDEX "PatientConsent_facility_idx" ON "PatientConsent"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "PatientMessage_operationKeyHash_key" ON "PatientMessage"("operationKeyHash");

-- CreateIndex
CREATE INDEX "PatientMessage_facility_idx" ON "PatientMessage"("facility");

-- CreateIndex
CREATE INDEX "PatientMessage_installation_idx" ON "PatientMessage"("installation");

-- CreateIndex
CREATE INDEX "PatientMessage_template_idx" ON "PatientMessage"("template");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalAccess_operationKeyHash_key" ON "PatientPortalAccess"("operationKeyHash");

-- CreateIndex
CREATE INDEX "PatientPortalAccess_facility_idx" ON "PatientPortalAccess"("facility");

-- CreateIndex
CREATE INDEX "PatientPortalAccess_patient_idx" ON "PatientPortalAccess"("patient");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalAccess_facility_patient_key" ON "PatientPortalAccess"("facility", "patient");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_installation_fkey" FOREIGN KEY ("installation") REFERENCES "IntegrationInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_template_fkey" FOREIGN KEY ("template") REFERENCES "CommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalAccess" ADD CONSTRAINT "PatientPortalAccess_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalAccess" ADD CONSTRAINT "PatientPortalAccess_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_installation_fkey" FOREIGN KEY ("installation") REFERENCES "IntegrationInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_auditLog_fkey" FOREIGN KEY ("auditLog") REFERENCES "ClinicalAuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_outboxEvent_fkey" FOREIGN KEY ("outboxEvent") REFERENCES "ClinicalOutboxEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "PatientCoverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_medicalOrder_fkey" FOREIGN KEY ("medicalOrder") REFERENCES "MedicalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labTest_fkey" FOREIGN KEY ("labTest") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_orderingProvider_fkey" FOREIGN KEY ("orderingProvider") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancyEvent" ADD CONSTRAINT "BedOccupancyEvent_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancyEvent" ADD CONSTRAINT "BedOccupancyEvent_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_attendingProvider_fkey" FOREIGN KEY ("attendingProvider") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimVersion" ADD CONSTRAINT "ClaimVersion_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimVersion" ADD CONSTRAINT "ClaimVersion_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimVersion" ADD CONSTRAINT "ClaimVersion_claim_fkey" FOREIGN KEY ("claim") REFERENCES "InsuranceClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimVersion" ADD CONSTRAINT "ClaimVersion_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "PatientCoverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_claim_fkey" FOREIGN KEY ("claim") REFERENCES "InsuranceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_installation_fkey" FOREIGN KEY ("installation") REFERENCES "IntegrationInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefund" ADD CONSTRAINT "PatientRefund_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefund" ADD CONSTRAINT "PatientRefund_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefund" ADD CONSTRAINT "PatientRefund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "PatientPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefund" ADD CONSTRAINT "PatientRefund_installation_fkey" FOREIGN KEY ("installation") REFERENCES "IntegrationInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_item_fkey" FOREIGN KEY ("item") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_prescription_fkey" FOREIGN KEY ("prescription") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_procedure_fkey" FOREIGN KEY ("procedure") REFERENCES "Procedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderScheduleBlock" ADD CONSTRAINT "ProviderScheduleBlock_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "Clinician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationTemplate" ADD CONSTRAINT "CommunicationTemplate_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_admission_fkey" FOREIGN KEY ("admission") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationInstallation" ADD CONSTRAINT "IntegrationInstallation_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineCredential" ADD CONSTRAINT "MachineCredential_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineCredential" ADD CONSTRAINT "MachineCredential_installation_fkey" FOREIGN KEY ("installation") REFERENCES "IntegrationInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineCredential" ADD CONSTRAINT "MachineCredential_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDeliveryAttempt" ADD CONSTRAINT "IntegrationDeliveryAttempt_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDeliveryAttempt" ADD CONSTRAINT "IntegrationDeliveryAttempt_installation_fkey" FOREIGN KEY ("installation") REFERENCES "IntegrationInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDeliveryAttempt" ADD CONSTRAINT "IntegrationDeliveryAttempt_outboxEvent_fkey" FOREIGN KEY ("outboxEvent") REFERENCES "ClinicalOutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookReceipt" ADD CONSTRAINT "IntegrationWebhookReceipt_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookReceipt" ADD CONSTRAINT "IntegrationWebhookReceipt_installation_fkey" FOREIGN KEY ("installation") REFERENCES "IntegrationInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_author_fkey" FOREIGN KEY ("author") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "ClinicalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_medicalOrder_fkey" FOREIGN KEY ("medicalOrder") REFERENCES "MedicalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionDisposition" ADD CONSTRAINT "RetentionDisposition_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionDisposition" ADD CONSTRAINT "RetentionDisposition_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionDisposition" ADD CONSTRAINT "RetentionDisposition_policy_fkey" FOREIGN KEY ("policy") REFERENCES "RetentionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordHold" ADD CONSTRAINT "RecordHold_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordHold" ADD CONSTRAINT "RecordHold_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentityLink" ADD CONSTRAINT "ExternalIdentityLink_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database checks for money, inventory, lifecycle evidence, and machine delivery state.
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_operation_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1);
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_operation_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1);
ALTER TABLE "PatientPortalAccess" ADD CONSTRAINT "PatientPortalAccess_operation_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64);
ALTER TABLE "CareQueueTicket" ADD CONSTRAINT "CareQueueTicket_position_check" CHECK ("queueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "queuePosition" >= 1);
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_delivery_mode_check" CHECK ("deliveryMode" IN ('internal','external') AND length("contractVersion") BETWEEN 1 AND 80 AND ("deliveryMode" <> 'external' OR "installation" IS NOT NULL));
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "fromVersion" >= 0 AND "toVersion" > "fromVersion");
ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1 AND "status" IN ('unverified','active','inactive','rejected'));
ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_money_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "amountCents" > 0 AND "refundedAmountCents" >= 0 AND "refundedAmountCents" <= "amountCents" AND "currency" ~ '^[A-Z]{3}$' AND "transitionVersion" >= 1 AND "status" IN ('pending','succeeded','failed','cancelled'));
ALTER TABLE "PatientRefund" ADD CONSTRAINT "PatientRefund_money_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "amountCents" > 0 AND "transitionVersion" >= 1 AND "status" IN ('pending','succeeded','failed','cancelled'));
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_balance_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "quantityOnHand" >= 0 AND "quantityReserved" >= 0 AND "quantityReserved" <= "quantityOnHand" AND "reorderPoint" >= 0 AND "transitionVersion" >= 1);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_balance_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "resultingOnHand" >= 0 AND "resultingReserved" >= 0 AND "resultingReserved" <= "resultingOnHand");
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1);
ALTER TABLE "CommunicationTemplate" ADD CONSTRAINT "CommunicationTemplate_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "version" >= 1 AND "transitionVersion" >= 1 AND "status" IN ('active','inactive'));
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1 AND "status" IN ('active','consumed','released','expired'));
ALTER TABLE "IntegrationInstallation" ADD CONSTRAINT "IntegrationInstallation_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1 AND "keyVersion" >= 1 AND "signingSecretCiphertext" <> '' AND "signingSecretIv" <> '' AND "signingSecretTag" <> '');
ALTER TABLE "MachineCredential" ADD CONSTRAINT "MachineCredential_digest_check" CHECK (length("secretDigest") = 64 AND length("keyPrefix") >= 8 AND length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1 AND "status" IN ('active','revoked','expired'));
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND length("contentHash") = 64 AND "version" >= 1 AND "transitionVersion" >= 1);
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1);
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1 AND "retentionDays" > 0);
ALTER TABLE "RetentionDisposition" ADD CONSTRAINT "RetentionDisposition_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "decision" IN ('retained','blocked_by_hold','eligible_for_review'));
ALTER TABLE "RecordHold" ADD CONSTRAINT "RecordHold_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1);
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND length("sourceHash") = 64 AND "rowCount" >= 0 AND "errorCount" >= 0 AND "transitionVersion" >= 1);
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "transitionVersion" >= 1 AND ("status" <> 'ready' OR (length("resultDigest") = 64 AND "resultCiphertext" <> '' AND "resultIv" <> '' AND "resultTag" <> '')));
ALTER TABLE "ExternalIdentityLink" ADD CONSTRAINT "ExternalIdentityLink_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64);
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_evidence_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND ("temperatureC" IS NOT NULL OR "systolicBp" IS NOT NULL OR "diastolicBp" IS NOT NULL OR "heartRate" IS NOT NULL OR "respiratoryRate" IS NOT NULL OR "oxygenSaturation" IS NOT NULL));

CREATE UNIQUE INDEX "BedReservation_active_bed_key" ON "BedReservation"("bed") WHERE "status" = 'active';
CREATE UNIQUE INDEX "ClaimVersion_claim_version_key" ON "ClaimVersion"("claim", "version");

CREATE OR REPLACE FUNCTION "reject_immutable_operational_evidence"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% evidence is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "WorkflowTransition_immutable" BEFORE UPDATE OR DELETE ON "WorkflowTransition" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();
CREATE TRIGGER "ClaimVersion_immutable" BEFORE UPDATE OR DELETE ON "ClaimVersion" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();
CREATE TRIGGER "InventoryMovement_immutable" BEFORE UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();
CREATE TRIGGER "IntegrationDeliveryAttempt_immutable" BEFORE UPDATE OR DELETE ON "IntegrationDeliveryAttempt" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();
CREATE TRIGGER "IntegrationWebhookReceipt_immutable" BEFORE UPDATE OR DELETE ON "IntegrationWebhookReceipt" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();
CREATE TRIGGER "ExternalIdentityLink_immutable" BEFORE UPDATE OR DELETE ON "ExternalIdentityLink" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();
CREATE TRIGGER "RetentionDisposition_immutable" BEFORE UPDATE OR DELETE ON "RetentionDisposition" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();
CREATE TRIGGER "VitalSign_immutable" BEFORE UPDATE OR DELETE ON "VitalSign" FOR EACH ROW EXECUTE FUNCTION "reject_immutable_operational_evidence"();

CREATE OR REPLACE FUNCTION "protect_operational_identity"() RETURNS trigger AS $$
BEGIN
  IF NEW."operationKeyHash" IS DISTINCT FROM OLD."operationKeyHash" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR NEW."facility" IS DISTINCT FROM OLD."facility" THEN
    RAISE EXCEPTION 'Operational identity and facility scope are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PatientCoverage_identity_guard" BEFORE UPDATE ON "PatientCoverage" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "PatientPayment_identity_guard" BEFORE UPDATE ON "PatientPayment" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "PatientRefund_identity_guard" BEFORE UPDATE ON "PatientRefund" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "InventoryItem_identity_guard" BEFORE UPDATE ON "InventoryItem" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "CommunicationPreference_identity_guard" BEFORE UPDATE ON "CommunicationPreference" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "CommunicationTemplate_identity_guard" BEFORE UPDATE ON "CommunicationTemplate" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "BedReservation_identity_guard" BEFORE UPDATE ON "BedReservation" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "IntegrationInstallation_identity_guard" BEFORE UPDATE ON "IntegrationInstallation" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "ClinicalDocument_identity_guard" BEFORE UPDATE ON "ClinicalDocument" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "Specimen_identity_guard" BEFORE UPDATE ON "Specimen" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "RetentionPolicy_identity_guard" BEFORE UPDATE ON "RetentionPolicy" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "RecordHold_identity_guard" BEFORE UPDATE ON "RecordHold" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "ImportBatch_identity_guard" BEFORE UPDATE ON "ImportBatch" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();
CREATE TRIGGER "ExportJob_identity_guard" BEFORE UPDATE ON "ExportJob" FOR EACH ROW EXECUTE FUNCTION "protect_operational_identity"();

CREATE OR REPLACE FUNCTION "protect_facility_owned_phi_scope"() RETURNS trigger AS $$
BEGIN
  IF NEW."facility" IS DISTINCT FROM OLD."facility" THEN RAISE EXCEPTION 'Direct facility scope is immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IntakeForm_facility_guard" BEFORE UPDATE ON "IntakeForm" FOR EACH ROW EXECUTE FUNCTION "protect_facility_owned_phi_scope"();
CREATE TRIGGER "PatientMessage_facility_guard" BEFORE UPDATE ON "PatientMessage" FOR EACH ROW EXECUTE FUNCTION "protect_facility_owned_phi_scope"();
CREATE TRIGGER "PatientPortalAccess_facility_guard" BEFORE UPDATE ON "PatientPortalAccess" FOR EACH ROW EXECUTE FUNCTION "protect_facility_owned_phi_scope"();
CREATE TRIGGER "ProviderScheduleBlock_facility_guard" BEFORE UPDATE ON "ProviderScheduleBlock" FOR EACH ROW EXECUTE FUNCTION "protect_facility_owned_phi_scope"();

CREATE OR REPLACE FUNCTION "protect_clinical_document_fact"() RETURNS trigger AS $$
BEGIN
  IF NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."encounter" IS DISTINCT FROM OLD."encounter" OR NEW."author" IS DISTINCT FROM OLD."author" OR NEW."supersedes" IS DISTINCT FROM OLD."supersedes" OR NEW."version" IS DISTINCT FROM OLD."version" OR NEW."content" IS DISTINCT FROM OLD."content" OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash" OR NEW."documentType" IS DISTINCT FROM OLD."documentType" THEN
    RAISE EXCEPTION 'Clinical document facts are immutable; create an amendment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ClinicalDocument_fact_guard" BEFORE UPDATE ON "ClinicalDocument" FOR EACH ROW EXECUTE FUNCTION "protect_clinical_document_fact"();

CREATE OR REPLACE FUNCTION "protect_machine_credential_secret"() RETURNS trigger AS $$
BEGIN
  IF NEW."secretDigest" IS DISTINCT FROM OLD."secretDigest" OR NEW."keyPrefix" IS DISTINCT FROM OLD."keyPrefix" OR NEW."operationKeyHash" IS DISTINCT FROM OLD."operationKeyHash" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR NEW."facility" IS DISTINCT FROM OLD."facility" OR NEW."installation" IS DISTINCT FROM OLD."installation" OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Machine credential identity and secret are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MachineCredential_secret_guard" BEFORE UPDATE ON "MachineCredential" FOR EACH ROW EXECUTE FUNCTION "protect_machine_credential_secret"();

CREATE OR REPLACE FUNCTION "protect_clinical_outbox_identity"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."eventKey" IS DISTINCT FROM OLD."eventKey" OR NEW."eventType" IS DISTINCT FROM OLD."eventType" OR NEW."aggregateType" IS DISTINCT FROM OLD."aggregateType" OR NEW."aggregateId" IS DISTINCT FROM OLD."aggregateId" OR NEW."contractVersion" IS DISTINCT FROM OLD."contractVersion" OR NEW."deliveryMode" IS DISTINCT FROM OLD."deliveryMode" OR NEW."installation" IS DISTINCT FROM OLD."installation" OR NEW."facility" IS DISTINCT FROM OLD."facility" OR NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."appointment" IS DISTINCT FROM OLD."appointment" OR NEW."encounter" IS DISTINCT FROM OLD."encounter" OR NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Clinical outbox event identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "enforce_refund_total"() RETURNS trigger AS $$
DECLARE payment_amount INTEGER; reserved_amount BIGINT;
BEGIN
  SELECT "amountCents" INTO payment_amount FROM "PatientPayment" WHERE "id" = NEW."payment" FOR UPDATE;
  SELECT COALESCE(SUM("amountCents"), 0) INTO reserved_amount FROM "PatientRefund" WHERE "payment" = NEW."payment" AND "status" IN ('pending','succeeded') AND "id" <> NEW."id";
  IF NEW."status" IN ('pending','succeeded') THEN reserved_amount := reserved_amount + NEW."amountCents"; END IF;
  IF payment_amount IS NULL OR reserved_amount > payment_amount THEN RAISE EXCEPTION 'Refund total exceeds payment amount'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PatientRefund_total_guard" BEFORE INSERT OR UPDATE ON "PatientRefund" FOR EACH ROW EXECUTE FUNCTION "enforce_refund_total"();
