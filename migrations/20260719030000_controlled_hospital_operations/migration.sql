-- Controlled hospital operations: direct tenancy, hook state, and immutable occupancy evidence.

-- AlterTable
ALTER TABLE "Admission" ADD COLUMN     "actorReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "encounter" TEXT,
ADD COLUMN     "facility" TEXT,
ADD COLUMN     "operationKeyHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transitionVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "Bed" ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "CarePlan" ADD COLUMN     "actorReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "encounter" TEXT,
ADD COLUMN     "facility" TEXT,
ADD COLUMN     "operationKeyHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transitionVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN     "actorReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "facility" TEXT,
ADD COLUMN     "operationKeyHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reasonCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transitionVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "LabResult" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedBy" TEXT,
ADD COLUMN     "actorReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "facility" TEXT,
ADD COLUMN     "medicalOrder" TEXT,
ADD COLUMN     "operationKeyHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "supersedesResult" TEXT,
ADD COLUMN     "transitionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'preliminary';

-- AlterTable
ALTER TABLE "MedicalOrder" ADD COLUMN     "actorReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "facility" TEXT,
ADD COLUMN     "operationKeyHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transitionVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "orderType" SET NOT NULL,
ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "actorReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "facility" TEXT,
ADD COLUMN     "medicalOrder" TEXT,
ADD COLUMN     "operationKeyHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transitionVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'draft';

-- AlterTable
ALTER TABLE "Procedure" ADD COLUMN     "actorReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "facility" TEXT,
ADD COLUMN     "medicalOrder" TEXT,
ADD COLUMN     "operationKeyHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transitionVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET NOT NULL;

-- CreateTable
CREATE TABLE "BedOccupancyEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL,
    "facility" TEXT,
    "patient" TEXT,
    "admission" TEXT,
    "bed" TEXT,
    "previousBed" TEXT,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedOccupancyEvent_pkey" PRIMARY KEY ("id")
);

-- Backfill deterministic tenancy and collision-safe legacy operation evidence before unique indexes.
UPDATE "Admission" a SET "facility" = COALESCE((SELECT e."facility" FROM "Encounter" e WHERE e."id"=a."encounter" LIMIT 1),(SELECT df."B" FROM "Room" r JOIN "Ward" w ON w."id"=r."ward" JOIN "_Department_facilities" df ON df."A"=w."department" WHERE r."id"=a."room" ORDER BY df."B" LIMIT 1),(SELECT fp."A" FROM "_Facility_patients" fp WHERE fp."B"=a."patient" ORDER BY fp."A" LIMIT 1));

UPDATE "CarePlan" r SET "facility"=COALESCE(
  (SELECT e."facility" FROM "Encounter" e WHERE e."id"=r."encounter" LIMIT 1),
  (SELECT pf."A" FROM "_Facility_providers" pf WHERE pf."B"=r."provider" ORDER BY pf."A" LIMIT 1),
  (SELECT pat."A" FROM "_Facility_patients" pat WHERE pat."B"=r."patient" ORDER BY pat."A" LIMIT 1)
);
UPDATE "InsuranceClaim" r SET "facility"=e."facility" FROM "Encounter" e WHERE e."id"=r."encounter";
UPDATE "Procedure" r SET "facility"=e."facility" FROM "Encounter" e WHERE e."id"=r."encounter";
UPDATE "LabResult" r SET "facility"=e."facility" FROM "Encounter" e WHERE e."id"=r."encounter";
UPDATE "Prescription" r SET "facility"=e."facility" FROM "Encounter" e WHERE e."id"=r."encounter";
UPDATE "MedicalOrder" r SET "facility"=e."facility" FROM "Encounter" e WHERE e."id"=r."encounter";

UPDATE "Admission" SET "operationKeyHash"=encode(digest('legacy:admission:'||"id",'sha256'),'hex'), "requestHash"=encode(digest('legacy:admission-payload:'||"id",'sha256'),'hex');
UPDATE "CarePlan" SET "operationKeyHash"=encode(digest('legacy:care-plan:'||"id",'sha256'),'hex'), "requestHash"=encode(digest('legacy:care-plan-payload:'||"id",'sha256'),'hex');
UPDATE "InsuranceClaim" SET "operationKeyHash"=encode(digest('legacy:claim:'||"id",'sha256'),'hex'), "requestHash"=encode(digest('legacy:claim-payload:'||"id",'sha256'),'hex');
UPDATE "Procedure" SET "operationKeyHash"=encode(digest('legacy:procedure:'||"id",'sha256'),'hex'), "requestHash"=encode(digest('legacy:procedure-payload:'||"id",'sha256'),'hex');
UPDATE "LabResult" SET "operationKeyHash"=encode(digest('legacy:result:'||"id",'sha256'),'hex'), "requestHash"=encode(digest('legacy:result-payload:'||"id",'sha256'),'hex');
UPDATE "Prescription" SET "operationKeyHash"=encode(digest('legacy:prescription:'||"id",'sha256'),'hex'), "requestHash"=encode(digest('legacy:prescription-payload:'||"id",'sha256'),'hex');
UPDATE "MedicalOrder" SET "operationKeyHash"=encode(digest('legacy:order:'||"id",'sha256'),'hex'), "requestHash"=encode(digest('legacy:order-payload:'||"id",'sha256'),'hex');

-- CreateIndex
CREATE UNIQUE INDEX "BedOccupancyEvent_eventKey_key" ON "BedOccupancyEvent"("eventKey");

-- CreateIndex
CREATE INDEX "BedOccupancyEvent_facility_idx" ON "BedOccupancyEvent"("facility");

-- CreateIndex
CREATE INDEX "BedOccupancyEvent_patient_idx" ON "BedOccupancyEvent"("patient");

-- CreateIndex
CREATE INDEX "BedOccupancyEvent_admission_idx" ON "BedOccupancyEvent"("admission");

-- CreateIndex
CREATE INDEX "BedOccupancyEvent_bed_idx" ON "BedOccupancyEvent"("bed");

-- CreateIndex
CREATE INDEX "BedOccupancyEvent_previousBed_idx" ON "BedOccupancyEvent"("previousBed");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_operationKeyHash_key" ON "Admission"("operationKeyHash");

-- CreateIndex
CREATE INDEX "Admission_facility_idx" ON "Admission"("facility");

-- CreateIndex
CREATE INDEX "Admission_encounter_idx" ON "Admission"("encounter");

-- CreateIndex
CREATE UNIQUE INDEX "CarePlan_operationKeyHash_key" ON "CarePlan"("operationKeyHash");

-- CreateIndex
CREATE INDEX "CarePlan_facility_idx" ON "CarePlan"("facility");

-- CreateIndex
CREATE INDEX "CarePlan_encounter_idx" ON "CarePlan"("encounter");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_operationKeyHash_key" ON "InsuranceClaim"("operationKeyHash");

-- CreateIndex
CREATE INDEX "InsuranceClaim_facility_idx" ON "InsuranceClaim"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "LabResult_operationKeyHash_key" ON "LabResult"("operationKeyHash");

-- CreateIndex
CREATE INDEX "LabResult_facility_idx" ON "LabResult"("facility");

-- CreateIndex
CREATE INDEX "LabResult_medicalOrder_idx" ON "LabResult"("medicalOrder");

-- CreateIndex
CREATE INDEX "LabResult_supersedesResult_idx" ON "LabResult"("supersedesResult");

-- CreateIndex
CREATE INDEX "LabResult_acknowledgedBy_idx" ON "LabResult"("acknowledgedBy");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalOrder_operationKeyHash_key" ON "MedicalOrder"("operationKeyHash");

-- CreateIndex
CREATE INDEX "MedicalOrder_facility_idx" ON "MedicalOrder"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_operationKeyHash_key" ON "Prescription"("operationKeyHash");

-- CreateIndex
CREATE INDEX "Prescription_facility_idx" ON "Prescription"("facility");

-- CreateIndex
CREATE INDEX "Prescription_medicalOrder_idx" ON "Prescription"("medicalOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_operationKeyHash_key" ON "Procedure"("operationKeyHash");

-- CreateIndex
CREATE INDEX "Procedure_facility_idx" ON "Procedure"("facility");

-- CreateIndex
CREATE INDEX "Procedure_medicalOrder_idx" ON "Procedure"("medicalOrder");

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_medicalOrder_fkey" FOREIGN KEY ("medicalOrder") REFERENCES "MedicalOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_medicalOrder_fkey" FOREIGN KEY ("medicalOrder") REFERENCES "MedicalOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_supersedesResult_fkey" FOREIGN KEY ("supersedesResult") REFERENCES "LabResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_acknowledgedBy_fkey" FOREIGN KEY ("acknowledgedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_medicalOrder_fkey" FOREIGN KEY ("medicalOrder") REFERENCES "MedicalOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancyEvent" ADD CONSTRAINT "BedOccupancyEvent_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancyEvent" ADD CONSTRAINT "BedOccupancyEvent_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancyEvent" ADD CONSTRAINT "BedOccupancyEvent_admission_fkey" FOREIGN KEY ("admission") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancyEvent" ADD CONSTRAINT "BedOccupancyEvent_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancyEvent" ADD CONSTRAINT "BedOccupancyEvent_previousBed_fkey" FOREIGN KEY ("previousBed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- New controlled workflow rows must always carry direct tenancy and bounded state.
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_controlled_evidence_check" CHECK (length("operationKeyHash")=64 AND length("requestHash")=64 AND "transitionVersion">=1);
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_controlled_evidence_check" CHECK (length("operationKeyHash")=64 AND length("requestHash")=64 AND "transitionVersion">=1);
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_controlled_evidence_check" CHECK (length("operationKeyHash")=64 AND length("requestHash")=64 AND "transitionVersion">=1 AND "version">=1);
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_controlled_evidence_check" CHECK (length("operationKeyHash")=64 AND length("requestHash")=64 AND "transitionVersion">=1);
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_controlled_evidence_check" CHECK (length("operationKeyHash")=64 AND length("requestHash")=64 AND "transitionVersion">=1);
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_controlled_evidence_check" CHECK (length("operationKeyHash")=64 AND length("requestHash")=64 AND "transitionVersion">=1);
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_controlled_evidence_check" CHECK (length("operationKeyHash")=64 AND length("requestHash")=64 AND "transitionVersion">=1);

-- One active admission may occupy a bed and one patient may have one active admission.
CREATE UNIQUE INDEX "Admission_active_bed_key" ON "Admission"("bed") WHERE "status" IN ('admitted','transferred') AND "bed" IS NOT NULL;
CREATE UNIQUE INDEX "Admission_active_patient_key" ON "Admission"("patient") WHERE "status" IN ('admitted','transferred') AND "patient" IS NOT NULL;
