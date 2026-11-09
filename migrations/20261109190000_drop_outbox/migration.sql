-- Remove the invented outbox: the event queue, its delivery attempts and the transition link to it.
-- Checked live first: every ClinicalOutboxEvent row was internal (no external delivery), IntegrationDeliveryAttempt was empty.
-- Only these tables and the WorkflowTransition.outboxEvent column are touched.
ALTER TABLE "WorkflowTransition" DROP CONSTRAINT IF EXISTS "WorkflowTransition_outboxEvent_fkey";
DROP INDEX IF EXISTS "WorkflowTransition_outboxEvent_idx";
ALTER TABLE "WorkflowTransition" DROP COLUMN IF EXISTS "outboxEvent";

DROP TABLE IF EXISTS "IntegrationDeliveryAttempt";
DROP TABLE IF EXISTS "ClinicalOutboxEvent";
DROP FUNCTION IF EXISTS "protect_clinical_outbox_identity"();
