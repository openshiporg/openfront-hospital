-- Raw GraphQL and Keystone hooks deny queue/outbox deletion. Keep identity fields
-- database-immutable while allowing explicit internal retention/test cleanup.
DROP TRIGGER "CareQueueTicket_history_guard" ON "CareQueueTicket";
DROP TRIGGER "ClinicalOutboxEvent_identity_guard" ON "ClinicalOutboxEvent";

CREATE OR REPLACE FUNCTION "protect_care_queue_history"() RETURNS trigger AS $$
BEGIN
  IF NEW."facility" IS DISTINCT FROM OLD."facility" OR NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."appointment" IS DISTINCT FROM OLD."appointment" OR NEW."ticketNumber" IS DISTINCT FROM OLD."ticketNumber" OR NEW."idempotencyKeyHash" IS DISTINCT FROM OLD."idempotencyKeyHash" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" THEN RAISE EXCEPTION 'Care queue identity is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CareQueueTicket_history_guard" BEFORE UPDATE ON "CareQueueTicket" FOR EACH ROW EXECUTE FUNCTION "protect_care_queue_history"();

CREATE OR REPLACE FUNCTION "protect_clinical_outbox_identity"() RETURNS trigger AS $$
BEGIN
  IF NEW."eventKey" IS DISTINCT FROM OLD."eventKey" OR NEW."eventType" IS DISTINCT FROM OLD."eventType" OR NEW."aggregateType" IS DISTINCT FROM OLD."aggregateType" OR NEW."aggregateId" IS DISTINCT FROM OLD."aggregateId" OR NEW."facility" IS DISTINCT FROM OLD."facility" OR NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."appointment" IS DISTINCT FROM OLD."appointment" OR NEW."encounter" IS DISTINCT FROM OLD."encounter" OR NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Clinical outbox event identity is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ClinicalOutboxEvent_identity_guard" BEFORE UPDATE ON "ClinicalOutboxEvent" FOR EACH ROW EXECUTE FUNCTION "protect_clinical_outbox_identity"();
