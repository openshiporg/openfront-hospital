-- Database guards for controlled workflow identity and immutable occupancy evidence.
CREATE OR REPLACE FUNCTION "protect_bed_occupancy_evidence"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Bed occupancy evidence is immutable';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "BedOccupancyEvent_immutable" BEFORE UPDATE ON "BedOccupancyEvent" FOR EACH ROW EXECUTE FUNCTION "protect_bed_occupancy_evidence"();

CREATE OR REPLACE FUNCTION "protect_controlled_clinical_identity"() RETURNS trigger AS $$
BEGIN
  IF NEW."operationKeyHash" IS DISTINCT FROM OLD."operationKeyHash" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR NEW."facility" IS DISTINCT FROM OLD."facility" OR NEW."patient" IS DISTINCT FROM OLD."patient" THEN
    RAISE EXCEPTION 'Controlled clinical identity and tenancy are immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "Admission_identity_guard" BEFORE UPDATE ON "Admission" FOR EACH ROW EXECUTE FUNCTION "protect_controlled_clinical_identity"();
CREATE TRIGGER "MedicalOrder_identity_guard" BEFORE UPDATE ON "MedicalOrder" FOR EACH ROW EXECUTE FUNCTION "protect_controlled_clinical_identity"();
CREATE TRIGGER "LabResult_identity_guard" BEFORE UPDATE ON "LabResult" FOR EACH ROW EXECUTE FUNCTION "protect_controlled_clinical_identity"();
CREATE TRIGGER "Prescription_identity_guard" BEFORE UPDATE ON "Prescription" FOR EACH ROW EXECUTE FUNCTION "protect_controlled_clinical_identity"();
CREATE TRIGGER "Procedure_identity_guard" BEFORE UPDATE ON "Procedure" FOR EACH ROW EXECUTE FUNCTION "protect_controlled_clinical_identity"();
CREATE TRIGGER "CarePlan_identity_guard" BEFORE UPDATE ON "CarePlan" FOR EACH ROW EXECUTE FUNCTION "protect_controlled_clinical_identity"();
CREATE TRIGGER "InsuranceClaim_identity_guard" BEFORE UPDATE ON "InsuranceClaim" FOR EACH ROW EXECUTE FUNCTION "protect_controlled_clinical_identity"();

CREATE OR REPLACE FUNCTION "protect_lab_result_fact"() RETURNS trigger AS $$
BEGIN
  IF NEW."resultValue" IS DISTINCT FROM OLD."resultValue" OR NEW."referenceRange" IS DISTINCT FROM OLD."referenceRange" OR NEW."abnormalFlag" IS DISTINCT FROM OLD."abnormalFlag" OR NEW."labTest" IS DISTINCT FROM OLD."labTest" OR NEW."medicalOrder" IS DISTINCT FROM OLD."medicalOrder" OR NEW."supersedesResult" IS DISTINCT FROM OLD."supersedesResult" OR NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'Lab result facts are immutable; create a corrected version';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "LabResult_fact_guard" BEFORE UPDATE ON "LabResult" FOR EACH ROW EXECUTE FUNCTION "protect_lab_result_fact"();
