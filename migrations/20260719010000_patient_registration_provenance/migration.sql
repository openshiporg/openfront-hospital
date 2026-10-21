-- Gate 7: immutable, facility-scoped registration identity and provenance.

CREATE TABLE "PatientIdentifier" (
    "id" TEXT NOT NULL,
    "identifierType" TEXT NOT NULL DEFAULT 'mrn',
    "normalizedValue" TEXT NOT NULL DEFAULT '',
    "maskedValue" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientIdentifier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientIdentifier_type_check" CHECK ("identifierType" = 'mrn'),
    CONSTRAINT "PatientIdentifier_value_check" CHECK ("normalizedValue" ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
    CONSTRAINT "PatientIdentifier_status_check" CHECK ("status" IN ('active', 'superseded'))
);

CREATE TABLE "PatientRegistration" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "consent" TEXT NOT NULL,
    "auditLog" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "duplicateResolution" TEXT NOT NULL,
    "provenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientRegistration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientRegistration_status_check" CHECK ("status" = 'completed'),
    CONSTRAINT "PatientRegistration_hashes_check" CHECK (length("idempotencyKeyHash") = 64 AND length("requestHash") = 64),
    CONSTRAINT "PatientRegistration_resolution_check" CHECK ("duplicateResolution" IN ('no_candidate', 'create_new', 'link_existing'))
);

CREATE INDEX "PatientIdentifier_facility_idx" ON "PatientIdentifier"("facility");
CREATE INDEX "PatientIdentifier_patient_idx" ON "PatientIdentifier"("patient");
CREATE INDEX "PatientIdentifier_createdBy_idx" ON "PatientIdentifier"("createdBy");
CREATE UNIQUE INDEX "PatientIdentifier_facility_value_key" ON "PatientIdentifier"("facility", "normalizedValue");

CREATE UNIQUE INDEX "PatientRegistration_identifier_key" ON "PatientRegistration"("identifier");
CREATE UNIQUE INDEX "PatientRegistration_consent_key" ON "PatientRegistration"("consent");
CREATE UNIQUE INDEX "PatientRegistration_auditLog_key" ON "PatientRegistration"("auditLog");
CREATE INDEX "PatientRegistration_facility_idx" ON "PatientRegistration"("facility");
CREATE INDEX "PatientRegistration_patient_idx" ON "PatientRegistration"("patient");
CREATE INDEX "PatientRegistration_identifier_idx" ON "PatientRegistration"("identifier");
CREATE INDEX "PatientRegistration_consent_idx" ON "PatientRegistration"("consent");
CREATE INDEX "PatientRegistration_auditLog_idx" ON "PatientRegistration"("auditLog");
CREATE INDEX "PatientRegistration_createdBy_idx" ON "PatientRegistration"("createdBy");
CREATE UNIQUE INDEX "PatientRegistration_facility_idempotency_key" ON "PatientRegistration"("facility", "idempotencyKeyHash");

ALTER TABLE "PatientIdentifier" ADD CONSTRAINT "PatientIdentifier_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientIdentifier" ADD CONSTRAINT "PatientIdentifier_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientIdentifier" ADD CONSTRAINT "PatientIdentifier_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientRegistration" ADD CONSTRAINT "PatientRegistration_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientRegistration" ADD CONSTRAINT "PatientRegistration_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientRegistration" ADD CONSTRAINT "PatientRegistration_identifier_fkey" FOREIGN KEY ("identifier") REFERENCES "PatientIdentifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientRegistration" ADD CONSTRAINT "PatientRegistration_consent_fkey" FOREIGN KEY ("consent") REFERENCES "PatientConsent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientRegistration" ADD CONSTRAINT "PatientRegistration_auditLog_fkey" FOREIGN KEY ("auditLog") REFERENCES "ClinicalAuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientRegistration" ADD CONSTRAINT "PatientRegistration_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
