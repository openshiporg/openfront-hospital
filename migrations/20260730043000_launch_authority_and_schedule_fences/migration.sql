-- Preserve the sole reviewed global authority and make appointment duration/
-- provider scheduling locks durable for every write path.

DO $$
DECLARE bad_appointment text;
BEGIN
  IF EXISTS (SELECT 1 FROM "User") AND (
    (SELECT count(*) FROM "Role" WHERE "canAccessAllClinicalData" = true) <> 1 OR
    (SELECT count(*) FROM "User" u JOIN "Role" r ON r."id" = u."role" WHERE r."canAccessAllClinicalData" = true) <> 1
  ) THEN
    RAISE EXCEPTION 'Existing installation must retain exactly one global clinical authority';
  END IF;

  SELECT appointment."id" INTO bad_appointment
  FROM "Appointment" appointment
  LEFT JOIN "AppointmentType" appointment_type ON appointment_type."id" = appointment."appointmentType"
  WHERE appointment."provider" IS NULL
     OR appointment."appointmentType" IS NULL
     OR appointment_type."durationMinutes" IS NULL
     OR appointment."endsAt" <> appointment."startsAt" + make_interval(mins => appointment_type."durationMinutes")
  LIMIT 1;
  IF bad_appointment IS NOT NULL THEN
    RAISE EXCEPTION 'Appointment % requires provider/type duration review before migration', bad_appointment;
  END IF;
END $$;

ALTER TABLE "Appointment"
  ALTER COLUMN "provider" SET NOT NULL,
  ALTER COLUMN "appointmentType" SET NOT NULL;
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_provider_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_appointmentType_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_provider_fkey"
  FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentType_fkey"
  FOREIGN KEY ("appointmentType") REFERENCES "AppointmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "rotate_user_identity_security"() RETURNS trigger AS $$
BEGIN
  IF NEW."email" IS DISTINCT FROM OLD."email" AND NEW."securityVersion" <= OLD."securityVersion" THEN
    NEW."securityVersion" := OLD."securityVersion" + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "User_identity_security_rotation_guard" ON "User";
CREATE TRIGGER "User_identity_security_rotation_guard"
BEFORE UPDATE OF "email" ON "User"
FOR EACH ROW EXECUTE FUNCTION "rotate_user_identity_security"();

CREATE OR REPLACE FUNCTION "supersede_user_resets_after_identity_change"() RETURNS trigger AS $$
BEGIN
  IF NEW."email" IS DISTINCT FROM OLD."email" THEN
    UPDATE "PasswordResetRequest"
    SET "status" = 'superseded', "supersededAt" = CURRENT_TIMESTAMP
    WHERE "user" = NEW."id" AND "status" = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "User_identity_reset_supersede_guard" ON "User";
CREATE TRIGGER "User_identity_reset_supersede_guard"
AFTER UPDATE OF "email" ON "User"
FOR EACH ROW EXECUTE FUNCTION "supersede_user_resets_after_identity_change"();

CREATE OR REPLACE FUNCTION "enforce_single_global_clinical_role"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('single-global-clinical-administrator', 0));
  IF TG_OP = 'UPDATE' AND OLD."canAccessAllClinicalData" = true AND NEW."canAccessAllClinicalData" = false THEN
    RAISE EXCEPTION 'The global clinical role cannot be demoted in-band';
  END IF;
  IF NEW."canAccessAllClinicalData" = true THEN
    IF EXISTS (SELECT 1 FROM "Role" WHERE "canAccessAllClinicalData" = true AND "id" <> NEW."id") THEN
      RAISE EXCEPTION 'Only one dedicated global clinical role is permitted';
    END IF;
    IF (SELECT count(*) FROM "User" WHERE "role" = NEW."id") > 1 THEN
      RAISE EXCEPTION 'A global clinical role may have only one assignee';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "prevent_global_clinical_role_delete"() RETURNS trigger AS $$
BEGIN
  IF OLD."canAccessAllClinicalData" = true THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('single-global-clinical-administrator', 0));
    RAISE EXCEPTION 'The global clinical role cannot be deleted in-band';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "Role_global_clinical_delete_guard" ON "Role";
CREATE TRIGGER "Role_global_clinical_delete_guard"
BEFORE DELETE ON "Role"
FOR EACH ROW EXECUTE FUNCTION "prevent_global_clinical_role_delete"();

CREATE OR REPLACE FUNCTION "enforce_single_global_clinical_user"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('single-global-clinical-administrator', 0));
  IF TG_OP = 'UPDATE'
     AND OLD."role" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "Role" WHERE "id" = OLD."role" AND "canAccessAllClinicalData" = true)
     AND NEW."role" IS DISTINCT FROM OLD."role" THEN
    RAISE EXCEPTION 'The global clinical assignee cannot be changed in-band';
  END IF;
  IF NEW."role" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "Role" WHERE "id" = NEW."role" AND "canAccessAllClinicalData" = true
  ) THEN
    IF EXISTS (
      SELECT 1 FROM "User" user_row JOIN "Role" role_row ON role_row."id" = user_row."role"
      WHERE role_row."canAccessAllClinicalData" = true AND user_row."id" <> NEW."id"
    ) THEN RAISE EXCEPTION 'Only one user may hold global clinical access'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "prevent_global_clinical_user_delete"() RETURNS trigger AS $$
BEGIN
  IF OLD."role" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "Role" WHERE "id" = OLD."role" AND "canAccessAllClinicalData" = true
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('single-global-clinical-administrator', 0));
    RAISE EXCEPTION 'The global clinical assignee cannot be deleted in-band';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "User_global_clinical_delete_guard" ON "User";
CREATE TRIGGER "User_global_clinical_delete_guard"
BEFORE DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION "prevent_global_clinical_user_delete"();

CREATE OR REPLACE FUNCTION "enforce_appointment_duration_and_provider_lock"() RETURNS trigger AS $$
DECLARE expected_duration integer;
BEGIN
  IF NEW."provider" IS NULL OR NEW."appointmentType" IS NULL THEN
    RAISE EXCEPTION 'Appointments require a provider and appointment type';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hospital-provider-schedule:' || NEW."provider", 0));
  SELECT "durationMinutes" INTO expected_duration FROM "AppointmentType" WHERE "id" = NEW."appointmentType";
  IF expected_duration IS NULL OR NEW."endsAt" <> NEW."startsAt" + make_interval(mins => expected_duration) THEN
    RAISE EXCEPTION 'Appointment window must match the appointment type duration';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "Appointment_duration_provider_lock_guard" ON "Appointment";
CREATE TRIGGER "Appointment_duration_provider_lock_guard"
BEFORE INSERT OR UPDATE OF "provider", "appointmentType", "startsAt", "endsAt" ON "Appointment"
FOR EACH ROW EXECUTE FUNCTION "enforce_appointment_duration_and_provider_lock"();

CREATE OR REPLACE FUNCTION "lock_provider_schedule_block_write"() RETURNS trigger AS $$
DECLARE provider_id text;
BEGIN
  provider_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."provider" ELSE NEW."provider" END;
  IF provider_id IS NULL THEN RAISE EXCEPTION 'Provider schedule blocks require a provider'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hospital-provider-schedule:' || provider_id, 0));
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ProviderScheduleBlock_provider_lock_guard" ON "ProviderScheduleBlock";
CREATE TRIGGER "ProviderScheduleBlock_provider_lock_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "ProviderScheduleBlock"
FOR EACH ROW EXECUTE FUNCTION "lock_provider_schedule_block_write"();
