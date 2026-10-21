-- Gate 8: hook-driven care queue plus facility-scoped durable outbox.

-- CreateTable
CREATE TABLE "ClinicalOutboxEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "appointment" TEXT,
    "encounter" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareQueueTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "reasonCode" TEXT NOT NULL DEFAULT 'scheduled_visit',
    "transitionVersion" INTEGER NOT NULL DEFAULT 1,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "idempotencyKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "calledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "facility" TEXT NOT NULL,
    "patient" TEXT NOT NULL,
    "appointment" TEXT NOT NULL,
    "encounter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareQueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalOutboxEvent_eventKey_key" ON "ClinicalOutboxEvent"("eventKey");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_eventType_idx" ON "ClinicalOutboxEvent"("eventType");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_aggregateId_idx" ON "ClinicalOutboxEvent"("aggregateId");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_status_idx" ON "ClinicalOutboxEvent"("status");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_nextAttemptAt_idx" ON "ClinicalOutboxEvent"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_facility_idx" ON "ClinicalOutboxEvent"("facility");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_patient_idx" ON "ClinicalOutboxEvent"("patient");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_appointment_idx" ON "ClinicalOutboxEvent"("appointment");

-- CreateIndex
CREATE INDEX "ClinicalOutboxEvent_encounter_idx" ON "ClinicalOutboxEvent"("encounter");

-- CreateIndex
CREATE UNIQUE INDEX "CareQueueTicket_ticketNumber_key" ON "CareQueueTicket"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CareQueueTicket_appointment_key" ON "CareQueueTicket"("appointment");

-- CreateIndex
CREATE INDEX "CareQueueTicket_facility_idx" ON "CareQueueTicket"("facility");

-- CreateIndex
CREATE INDEX "CareQueueTicket_patient_idx" ON "CareQueueTicket"("patient");

-- CreateIndex
CREATE INDEX "CareQueueTicket_appointment_idx" ON "CareQueueTicket"("appointment");

-- CreateIndex
CREATE INDEX "CareQueueTicket_encounter_idx" ON "CareQueueTicket"("encounter");

-- AddForeignKey
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareQueueTicket" ADD CONSTRAINT "CareQueueTicket_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareQueueTicket" ADD CONSTRAINT "CareQueueTicket_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareQueueTicket" ADD CONSTRAINT "CareQueueTicket_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareQueueTicket" ADD CONSTRAINT "CareQueueTicket_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "CareQueueTicket"
  ADD CONSTRAINT "CareQueueTicket_status_check" CHECK ("status" IN ('waiting','called','in_care','completed','cancelled')),
  ADD CONSTRAINT "CareQueueTicket_priority_check" CHECK ("priority" IN ('routine','time_sensitive')),
  ADD CONSTRAINT "CareQueueTicket_hash_check" CHECK (length("idempotencyKeyHash") = 64 AND length("requestHash") = 64),
  ADD CONSTRAINT "CareQueueTicket_version_check" CHECK ("transitionVersion" >= 1);
ALTER TABLE "ClinicalOutboxEvent"
  ADD CONSTRAINT "ClinicalOutboxEvent_status_check" CHECK ("status" IN ('pending','processing','retry','delivered','dead_letter')),
  ADD CONSTRAINT "ClinicalOutboxEvent_attempts_check" CHECK ("attempts" >= 0);

CREATE OR REPLACE FUNCTION "protect_care_queue_history"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Care queue history is immutable'; END IF;
  IF NEW."facility" IS DISTINCT FROM OLD."facility" OR NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."appointment" IS DISTINCT FROM OLD."appointment" OR NEW."ticketNumber" IS DISTINCT FROM OLD."ticketNumber" OR NEW."idempotencyKeyHash" IS DISTINCT FROM OLD."idempotencyKeyHash" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" THEN RAISE EXCEPTION 'Care queue identity is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CareQueueTicket_history_guard" BEFORE UPDATE OR DELETE ON "CareQueueTicket" FOR EACH ROW EXECUTE FUNCTION "protect_care_queue_history"();

CREATE OR REPLACE FUNCTION "protect_clinical_outbox_identity"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Clinical outbox events cannot be deleted'; END IF;
  IF NEW."eventKey" IS DISTINCT FROM OLD."eventKey" OR NEW."eventType" IS DISTINCT FROM OLD."eventType" OR NEW."aggregateType" IS DISTINCT FROM OLD."aggregateType" OR NEW."aggregateId" IS DISTINCT FROM OLD."aggregateId" OR NEW."facility" IS DISTINCT FROM OLD."facility" OR NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."appointment" IS DISTINCT FROM OLD."appointment" OR NEW."encounter" IS DISTINCT FROM OLD."encounter" OR NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Clinical outbox event identity is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ClinicalOutboxEvent_identity_guard" BEFORE UPDATE OR DELETE ON "ClinicalOutboxEvent" FOR EACH ROW EXECUTE FUNCTION "protect_clinical_outbox_identity"();
