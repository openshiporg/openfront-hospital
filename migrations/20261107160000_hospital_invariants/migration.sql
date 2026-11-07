-- Round 2 (invariants grill): rules the app relied on but only checked in app code, if at all.
-- Live data was checked against every rule before this migration (0 violations).
-- Error text starts with the rule name so the GraphQL layer can show a readable, coded refusal
-- (Prisma drops constraint names from trigger errors).

-- Beds: one bed number per room; a bed is occupied exactly when it names its patient; one bed per patient.
CREATE UNIQUE INDEX "Bed_room_bedNumber_key" ON "Bed"("room", "bedNumber") WHERE "room" IS NOT NULL;
CREATE UNIQUE INDEX "Bed_one_per_current_patient" ON "Bed"("currentPatient") WHERE "currentPatient" IS NOT NULL;
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_status_valid" CHECK ("status" IN ('available', 'occupied', 'reserved', 'cleaning', 'out_of_service'));
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_occupancy_matches_patient" CHECK (("status" = 'occupied') = ("currentPatient" IS NOT NULL));

-- Record holds: one active hold per held record (the writer checks under an advisory lock; this is the backstop).
CREATE UNIQUE INDEX "RecordHold_one_active_per_record" ON "RecordHold"("facility", "aggregateType", "aggregateId") WHERE "status" = 'active';

-- Money that had no database floor.
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_amounts_valid" CHECK (
  COALESCE("billedAmountCents", 0) >= 0 AND COALESCE("paidAmountCents", 0) >= 0
  AND ("paidAmountCents" IS NULL OR "billedAmountCents" IS NULL OR "paidAmountCents" <= "billedAmountCents")
);
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_fee_non_negative" CHECK ("estimatedFeeCents" IS NULL OR "estimatedFeeCents" >= 0);
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_price_non_negative" CHECK ("priceCents" IS NULL OR "priceCents" >= 0);
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_capacity_non_negative" CHECK ("capacity" IS NULL OR "capacity" >= 0);

-- Time ranges.
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_discharge_after_admit" CHECK ("dischargedAt" IS NULL OR "admittedAt" IS NULL OR "dischargedAt" >= "admittedAt");
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_end_after_start" CHECK ("endedAt" IS NULL OR "startedAt" IS NULL OR "endedAt" >= "startedAt");
ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_term_range" CHECK ("terminatesAt" IS NULL OR "effectiveAt" IS NULL OR "terminatesAt" > "effectiveAt");
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_expires_after_created" CHECK ("expiresAt" > "createdAt");

-- Refund ledger: a payment's refundedAmountCents always equals its succeeded refunds.
-- Every writer updates the refund and increments the payment in one transaction, so this is checked at commit.
CREATE OR REPLACE FUNCTION "hospital_refund_ledger_balances"() RETURNS trigger AS $$
DECLARE payment_id text; recorded integer; settled bigint;
BEGIN
  -- Separate branches: plpgsql resolves NEW."payment" even in an untaken CASE arm, and PatientPayment has no such field.
  IF TG_TABLE_NAME = 'PatientPayment' THEN payment_id := NEW."id"; ELSE payment_id := NEW."payment"; END IF;
  SELECT "refundedAmountCents" INTO recorded FROM "PatientPayment" WHERE "id" = payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM("amountCents"), 0) INTO settled FROM "PatientRefund" WHERE "payment" = payment_id AND "status" = 'succeeded';
  IF recorded <> settled THEN
    RAISE EXCEPTION 'PatientPayment_refund_ledger: refunded total % does not match succeeded refunds %', recorded, settled USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "PatientPayment_refund_ledger" AFTER INSERT OR UPDATE OF "refundedAmountCents" ON "PatientPayment"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "hospital_refund_ledger_balances"();
CREATE CONSTRAINT TRIGGER "PatientRefund_refund_ledger" AFTER INSERT OR UPDATE OF "status", "amountCents" ON "PatientRefund"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "hospital_refund_ledger_balances"();

-- Existing refund-total guard: same rule, now with a nameable message and a check-violation code.
CREATE OR REPLACE FUNCTION "enforce_refund_total"() RETURNS trigger AS $$
DECLARE payment_amount INTEGER; reserved_amount BIGINT;
BEGIN
  SELECT "amountCents" INTO payment_amount FROM "PatientPayment" WHERE "id" = NEW."payment" FOR UPDATE;
  SELECT COALESCE(SUM("amountCents"), 0) INTO reserved_amount FROM "PatientRefund" WHERE "payment" = NEW."payment" AND "status" IN ('pending','succeeded') AND "id" <> NEW."id";
  IF NEW."status" IN ('pending','succeeded') THEN reserved_amount := reserved_amount + NEW."amountCents"; END IF;
  IF payment_amount IS NULL OR reserved_amount > payment_amount THEN
    RAISE EXCEPTION 'PatientRefund_total_guard: Refund total exceeds payment amount' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Archiving a parent must not silently strip its children: these relations are ON DELETE SET NULL,
-- so deleting a room left its beds roomless (even an occupied bed), a ward orphaned its rooms, and a
-- department erased where past encounters happened. Refuse instead; retire the record (status) first.
CREATE OR REPLACE FUNCTION "hospital_refuse_delete_in_use"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'Room' AND EXISTS (SELECT 1 FROM "Bed" WHERE "room" = OLD."id") THEN
    RAISE EXCEPTION 'Room_delete_in_use: room still has beds' USING ERRCODE = '23503';
  ELSIF TG_TABLE_NAME = 'Ward' AND EXISTS (SELECT 1 FROM "Room" WHERE "ward" = OLD."id") THEN
    RAISE EXCEPTION 'Ward_delete_in_use: ward still has rooms' USING ERRCODE = '23503';
  ELSIF TG_TABLE_NAME = 'Department' AND (
    EXISTS (SELECT 1 FROM "Ward" WHERE "department" = OLD."id")
    OR EXISTS (SELECT 1 FROM "Encounter" WHERE "department" = OLD."id")
    OR EXISTS (SELECT 1 FROM "Clinician" WHERE "department" = OLD."id")
  ) THEN
    RAISE EXCEPTION 'Department_delete_in_use: department still has wards, clinicians or encounters' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Room_delete_in_use" BEFORE DELETE ON "Room" FOR EACH ROW EXECUTE FUNCTION "hospital_refuse_delete_in_use"();
CREATE TRIGGER "Ward_delete_in_use" BEFORE DELETE ON "Ward" FOR EACH ROW EXECUTE FUNCTION "hospital_refuse_delete_in_use"();
CREATE TRIGGER "Department_delete_in_use" BEFORE DELETE ON "Department" FOR EACH ROW EXECUTE FUNCTION "hospital_refuse_delete_in_use"();
