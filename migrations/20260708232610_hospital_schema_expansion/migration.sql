-- AlterTable
ALTER TABLE "_AppointmentType_providers" ADD CONSTRAINT "_AppointmentType_providers_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_AppointmentType_providers_AB_unique";

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "provider" TEXT,
    "status" TEXT DEFAULT 'draft',
    "goals" TEXT NOT NULL DEFAULT '',
    "interventions" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "encounter" TEXT,
    "payerName" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'draft',
    "billedAmountCents" INTEGER DEFAULT 0,
    "paidAmountCents" INTEGER DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "denialReason" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" TEXT NOT NULL,
    "procedureNumber" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "encounter" TEXT,
    "provider" TEXT,
    "procedureName" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "id" TEXT NOT NULL,
    "resultNumber" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "encounter" TEXT,
    "labTest" TEXT,
    "status" TEXT DEFAULT 'pending',
    "resultValue" TEXT NOT NULL DEFAULT '',
    "referenceRange" TEXT NOT NULL DEFAULT '',
    "abnormalFlag" TEXT DEFAULT 'normal',
    "resultedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "specimenType" TEXT NOT NULL DEFAULT '',
    "turnaroundHours" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "prescriptionNumber" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "provider" TEXT,
    "encounter" TEXT,
    "medicationName" TEXT NOT NULL DEFAULT '',
    "dosage" TEXT NOT NULL DEFAULT '',
    "frequency" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL DEFAULT '',
    "orderType" TEXT DEFAULT 'lab',
    "status" TEXT DEFAULT 'draft',
    "patient" TEXT,
    "encounter" TEXT,
    "orderingProvider" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "orderedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalSign" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "encounter" TEXT,
    "recordedBy" TEXT,
    "recordedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "temperatureC" INTEGER,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "oxygenSaturation" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VitalSign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinician" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "clinicianType" TEXT DEFAULT 'physician',
    "provider" TEXT,
    "department" TEXT,
    "licenseNumber" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clinician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "bedNumber" TEXT NOT NULL DEFAULT '',
    "room" TEXT,
    "status" TEXT DEFAULT 'available',
    "currentPatient" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL DEFAULT '',
    "ward" TEXT,
    "roomType" TEXT DEFAULT 'private',
    "status" TEXT DEFAULT 'available',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "department" TEXT,
    "floor" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'open',
    "capacity" INTEGER DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "description" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'admitted',
    "patient" TEXT,
    "attendingProvider" TEXT,
    "room" TEXT,
    "bed" TEXT,
    "admittedAt" TIMESTAMP(3),
    "dischargedAt" TIMESTAMP(3),
    "dischargeDisposition" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "encounterNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'open',
    "patient" TEXT,
    "provider" TEXT,
    "appointment" TEXT,
    "department" TEXT,
    "chiefComplaint" TEXT NOT NULL DEFAULT '',
    "diagnosisSummary" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarePlan_patient_idx" ON "CarePlan"("patient");

-- CreateIndex
CREATE INDEX "CarePlan_provider_idx" ON "CarePlan"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_claimNumber_key" ON "InsuranceClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "InsuranceClaim_patient_idx" ON "InsuranceClaim"("patient");

-- CreateIndex
CREATE INDEX "InsuranceClaim_encounter_idx" ON "InsuranceClaim"("encounter");

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_procedureNumber_key" ON "Procedure"("procedureNumber");

-- CreateIndex
CREATE INDEX "Procedure_patient_idx" ON "Procedure"("patient");

-- CreateIndex
CREATE INDEX "Procedure_encounter_idx" ON "Procedure"("encounter");

-- CreateIndex
CREATE INDEX "Procedure_provider_idx" ON "Procedure"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "LabResult_resultNumber_key" ON "LabResult"("resultNumber");

-- CreateIndex
CREATE INDEX "LabResult_patient_idx" ON "LabResult"("patient");

-- CreateIndex
CREATE INDEX "LabResult_encounter_idx" ON "LabResult"("encounter");

-- CreateIndex
CREATE INDEX "LabResult_labTest_idx" ON "LabResult"("labTest");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_code_key" ON "LabTest"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_prescriptionNumber_key" ON "Prescription"("prescriptionNumber");

-- CreateIndex
CREATE INDEX "Prescription_patient_idx" ON "Prescription"("patient");

-- CreateIndex
CREATE INDEX "Prescription_provider_idx" ON "Prescription"("provider");

-- CreateIndex
CREATE INDEX "Prescription_encounter_idx" ON "Prescription"("encounter");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalOrder_orderNumber_key" ON "MedicalOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "MedicalOrder_patient_idx" ON "MedicalOrder"("patient");

-- CreateIndex
CREATE INDEX "MedicalOrder_encounter_idx" ON "MedicalOrder"("encounter");

-- CreateIndex
CREATE INDEX "MedicalOrder_orderingProvider_idx" ON "MedicalOrder"("orderingProvider");

-- CreateIndex
CREATE INDEX "VitalSign_patient_idx" ON "VitalSign"("patient");

-- CreateIndex
CREATE INDEX "VitalSign_encounter_idx" ON "VitalSign"("encounter");

-- CreateIndex
CREATE INDEX "VitalSign_recordedBy_idx" ON "VitalSign"("recordedBy");

-- CreateIndex
CREATE INDEX "Clinician_provider_idx" ON "Clinician"("provider");

-- CreateIndex
CREATE INDEX "Clinician_department_idx" ON "Clinician"("department");

-- CreateIndex
CREATE INDEX "Bed_room_idx" ON "Bed"("room");

-- CreateIndex
CREATE INDEX "Bed_currentPatient_idx" ON "Bed"("currentPatient");

-- CreateIndex
CREATE UNIQUE INDEX "Room_roomNumber_key" ON "Room"("roomNumber");

-- CreateIndex
CREATE INDEX "Room_ward_idx" ON "Room"("ward");

-- CreateIndex
CREATE INDEX "Ward_department_idx" ON "Ward"("department");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_admissionNumber_key" ON "Admission"("admissionNumber");

-- CreateIndex
CREATE INDEX "Admission_patient_idx" ON "Admission"("patient");

-- CreateIndex
CREATE INDEX "Admission_attendingProvider_idx" ON "Admission"("attendingProvider");

-- CreateIndex
CREATE INDEX "Admission_room_idx" ON "Admission"("room");

-- CreateIndex
CREATE INDEX "Admission_bed_idx" ON "Admission"("bed");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_encounterNumber_key" ON "Encounter"("encounterNumber");

-- CreateIndex
CREATE INDEX "Encounter_patient_idx" ON "Encounter"("patient");

-- CreateIndex
CREATE INDEX "Encounter_provider_idx" ON "Encounter"("provider");

-- CreateIndex
CREATE INDEX "Encounter_appointment_idx" ON "Encounter"("appointment");

-- CreateIndex
CREATE INDEX "Encounter_department_idx" ON "Encounter"("department");

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labTest_fkey" FOREIGN KEY ("labTest") REFERENCES "LabTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalOrder" ADD CONSTRAINT "MedicalOrder_orderingProvider_fkey" FOREIGN KEY ("orderingProvider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "Clinician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinician" ADD CONSTRAINT "Clinician_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinician" ADD CONSTRAINT "Clinician_department_fkey" FOREIGN KEY ("department") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_currentPatient_fkey" FOREIGN KEY ("currentPatient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_ward_fkey" FOREIGN KEY ("ward") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_department_fkey" FOREIGN KEY ("department") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_attendingProvider_fkey" FOREIGN KEY ("attendingProvider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_department_fkey" FOREIGN KEY ("department") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

