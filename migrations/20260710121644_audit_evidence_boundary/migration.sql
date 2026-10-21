-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "consentType" TEXT NOT NULL DEFAULT '',
    "policyVersion" TEXT NOT NULL DEFAULT '',
    "statementKey" TEXT NOT NULL DEFAULT '',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captureMethod" TEXT NOT NULL DEFAULT 'public_web',
    "patient" TEXT,
    "appointment" TEXT,
    "intakeForm" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalAuditLog" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL DEFAULT 'patient',
    "actorReference" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "appointment" TEXT,
    "intakeForm" TEXT,
    "consent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientConsent_patient_idx" ON "PatientConsent"("patient");

-- CreateIndex
CREATE INDEX "PatientConsent_appointment_idx" ON "PatientConsent"("appointment");

-- CreateIndex
CREATE INDEX "PatientConsent_intakeForm_idx" ON "PatientConsent"("intakeForm");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_patient_idx" ON "ClinicalAuditLog"("patient");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_appointment_idx" ON "ClinicalAuditLog"("appointment");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_intakeForm_idx" ON "ClinicalAuditLog"("intakeForm");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_consent_idx" ON "ClinicalAuditLog"("consent");

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_intakeForm_fkey" FOREIGN KEY ("intakeForm") REFERENCES "IntakeForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_intakeForm_fkey" FOREIGN KEY ("intakeForm") REFERENCES "IntakeForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_consent_fkey" FOREIGN KEY ("consent") REFERENCES "PatientConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
