-- Forward-only identity, recovery, integration-generation, and retained-tenancy
-- fences. Earlier applied migrations remain immutable.

ALTER TABLE "User" ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD CONSTRAINT "User_security_version_check" CHECK ("securityVersion" >= 1);
UPDATE "User" SET "passwordResetToken" = NULL, "passwordResetIssuedAt" = NULL, "passwordResetRedeemedAt" = NULL;

CREATE TABLE "PasswordResetRequest" (
  "id" TEXT NOT NULL,
  "tokenDigest" TEXT NOT NULL DEFAULT '',
  "accountDigest" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "user" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "mailSentAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "deliveryFailedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetRequest_status_check" CHECK ("status" IN ('pending','redeemed','superseded','expired','delivery_failed')),
  CONSTRAINT "PasswordResetRequest_digest_check" CHECK (length("tokenDigest") = 64 AND length("accountDigest") = 64)
);
CREATE UNIQUE INDEX "PasswordResetRequest_tokenDigest_key" ON "PasswordResetRequest"("tokenDigest");
CREATE INDEX "PasswordResetRequest_accountDigest_idx" ON "PasswordResetRequest"("accountDigest");
CREATE INDEX "PasswordResetRequest_status_idx" ON "PasswordResetRequest"("status");
CREATE INDEX "PasswordResetRequest_expiresAt_idx" ON "PasswordResetRequest"("expiresAt");
CREATE INDEX "PasswordResetRequest_user_status_expiry_idx" ON "PasswordResetRequest"("user", "status", "expiresAt");
CREATE INDEX "PasswordResetRequest_user_idx" ON "PasswordResetRequest"("user");
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalOutboxEvent" ADD COLUMN "installationVersion" INTEGER;
UPDATE "ClinicalOutboxEvent" event
SET "installationVersion" = installation."transitionVersion"
FROM "IntegrationInstallation" installation
WHERE event."deliveryMode" = 'external' AND event."installation" = installation."id";
UPDATE "ClinicalOutboxEvent" event
SET "status" = 'dead_letter', "nextAttemptAt" = NULL, "lastError" = 'integration_generation_revoked'
FROM "IntegrationInstallation" installation
WHERE event."deliveryMode" = 'external' AND event."installation" = installation."id" AND installation."status" <> 'active';
ALTER TABLE "ClinicalOutboxEvent" DROP CONSTRAINT "ClinicalOutboxEvent_delivery_mode_check";
ALTER TABLE "ClinicalOutboxEvent" ADD CONSTRAINT "ClinicalOutboxEvent_delivery_mode_check" CHECK (
  "deliveryMode" IN ('internal','external')
  AND length("contractVersion") BETWEEN 1 AND 80
  AND (
    "deliveryMode" <> 'external'
    OR ("installation" IS NOT NULL AND "installationVersion" IS NOT NULL AND "installationVersion" >= 1)
  )
);

-- Correct the prior role-level review into a dedicated role assigned to exactly
-- one explicitly reviewed user. Multi-assignee legacy roles lose the bypass.
DO $$
DECLARE
  reviewed_email text := COALESCE(
    NULLIF(current_setting('openfront.reviewed_global_admin_email', true), ''),
    'hospital@openship.org'
  );
  reviewed_user_id text;
  source_role_id text;
  dedicated_role_id text;
  reviewed_count integer;
BEGIN
  IF (SELECT count(*) FROM "User") = 0 THEN RETURN; END IF;

  SELECT count(*), min("id") INTO reviewed_count, reviewed_user_id
  FROM "User" WHERE lower("email") = lower(reviewed_email);
  IF reviewed_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one reviewed global administrator user for %', reviewed_email;
  END IF;
  SELECT "role" INTO source_role_id FROM "User" WHERE "id" = reviewed_user_id;
  IF source_role_id IS NULL THEN RAISE EXCEPTION 'Reviewed administrator has no source role'; END IF;
  dedicated_role_id := 'reviewed-global-' || substr(md5(reviewed_user_id), 1, 16);

  UPDATE "Role" SET "canAccessAllClinicalData" = false WHERE "canAccessAllClinicalData" = true;
  INSERT INTO "Role" (
    "id", "name", "canSeeOtherPeople", "canEditOtherPeople", "canManagePeople", "canManageRoles",
    "canAccessDashboard", "canManageAppointments", "canManageCommunications", "canManageIntake",
    "canManageOnboarding", "canManagePatients", "canManageProviders", "canManageScheduling", "canViewReports",
    "canManageBilling", "canManageDataPortability", "canManageIntegrations", "canManageInventory",
    "canManageRetention", "canAccessAllClinicalData", "createdAt", "updatedAt"
  )
  SELECT
    dedicated_role_id, 'Global Clinical Administrator', "canSeeOtherPeople", "canEditOtherPeople", "canManagePeople", "canManageRoles",
    "canAccessDashboard", "canManageAppointments", "canManageCommunications", "canManageIntake",
    "canManageOnboarding", "canManagePatients", "canManageProviders", "canManageScheduling", "canViewReports",
    "canManageBilling", "canManageDataPortability", "canManageIntegrations", "canManageInventory",
    "canManageRetention", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Role" WHERE "id" = source_role_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed administrator source role was not found'; END IF;
  UPDATE "User" SET "role" = dedicated_role_id, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = reviewed_user_id;

  IF (SELECT count(*) FROM "Role" WHERE "canAccessAllClinicalData" = true) <> 1
    OR (SELECT count(*) FROM "User" user_row JOIN "Role" role_row ON role_row."id" = user_row."role" WHERE role_row."canAccessAllClinicalData" = true) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM "User" user_row JOIN "Role" role_row ON role_row."id" = user_row."role"
      WHERE user_row."id" = reviewed_user_id AND role_row."canAccessAllClinicalData" = true
    )
  THEN RAISE EXCEPTION 'Global clinical administrator correction did not produce exactly one reviewed user'; END IF;
END $$;

CREATE OR REPLACE FUNCTION "enforce_single_global_clinical_role"() RETURNS trigger AS $$
BEGIN
  IF NEW."canAccessAllClinicalData" = true THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('single-global-clinical-administrator', 0));
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
CREATE TRIGGER "Role_single_global_clinical_guard"
BEFORE INSERT OR UPDATE OF "canAccessAllClinicalData" ON "Role"
FOR EACH ROW EXECUTE FUNCTION "enforce_single_global_clinical_role"();

CREATE OR REPLACE FUNCTION "enforce_single_global_clinical_user"() RETURNS trigger AS $$
BEGIN
  IF NEW."role" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "Role" WHERE "id" = NEW."role" AND "canAccessAllClinicalData" = true
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('single-global-clinical-administrator', 0));
    IF EXISTS (
      SELECT 1 FROM "User" user_row JOIN "Role" role_row ON role_row."id" = user_row."role"
      WHERE role_row."canAccessAllClinicalData" = true AND user_row."id" <> NEW."id"
    ) THEN RAISE EXCEPTION 'Only one user may hold global clinical access'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "User_single_global_clinical_guard"
BEFORE INSERT OR UPDATE OF "role" ON "User"
FOR EACH ROW EXECUTE FUNCTION "enforce_single_global_clinical_user"();

-- Fail closed on legacy Admission/CarePlan assignments that were populated by
-- arbitrary first-facility fallbacks in an earlier applied migration.
DO $$
DECLARE bad_id text;
BEGIN
  SELECT admission."id" INTO bad_id
  FROM "Admission" admission
  JOIN "Bed" bed ON bed."id" = admission."bed"
  JOIN "Room" room ON room."id" = admission."room"
  WHERE admission."facility" <> bed."facility"
     OR admission."room" <> bed."room"
     OR NOT EXISTS (SELECT 1 FROM "_Facility_patients" link WHERE link."A" = admission."facility" AND link."B" = admission."patient")
     OR NOT EXISTS (SELECT 1 FROM "_Facility_providers" link WHERE link."A" = admission."facility" AND link."B" = admission."attendingProvider")
     OR NOT EXISTS (
       SELECT 1 FROM "Ward" ward JOIN "_Department_facilities" link ON link."A" = ward."department"
       WHERE ward."id" = room."ward" AND link."B" = admission."facility"
     )
     OR EXISTS (
       SELECT 1 FROM "Encounter" encounter WHERE encounter."id" = admission."encounter"
         AND (encounter."facility" <> admission."facility" OR encounter."patient" <> admission."patient")
     )
  LIMIT 1;
  IF bad_id IS NOT NULL THEN RAISE EXCEPTION 'Admission retained tenancy requires explicit quarantine/review for %', bad_id; END IF;

  SELECT plan."id" INTO bad_id
  FROM "CarePlan" plan
  WHERE NOT EXISTS (SELECT 1 FROM "_Facility_patients" link WHERE link."A" = plan."facility" AND link."B" = plan."patient")
     OR NOT EXISTS (SELECT 1 FROM "_Facility_providers" link WHERE link."A" = plan."facility" AND link."B" = plan."provider")
     OR EXISTS (
       SELECT 1 FROM "Encounter" encounter WHERE encounter."id" = plan."encounter"
         AND (encounter."facility" <> plan."facility" OR encounter."patient" <> plan."patient")
     )
     OR (
       plan."encounter" IS NULL AND (
         SELECT count(*) FROM "_Facility_patients" patient_link
         JOIN "_Facility_providers" provider_link ON provider_link."A" = patient_link."A"
         WHERE patient_link."B" = plan."patient" AND provider_link."B" = plan."provider"
       ) <> 1
     )
  LIMIT 1;
  IF bad_id IS NOT NULL THEN RAISE EXCEPTION 'Care plan retained tenancy requires explicit quarantine/review for %', bad_id; END IF;
END $$;

CREATE OR REPLACE FUNCTION "enforce_admission_tenant_chain"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Bed" bed JOIN "Room" room ON room."id" = NEW."room"
    JOIN "Ward" ward ON ward."id" = room."ward"
    JOIN "_Department_facilities" department_facility ON department_facility."A" = ward."department"
    WHERE bed."id" = NEW."bed" AND bed."room" = NEW."room" AND bed."facility" = NEW."facility"
      AND department_facility."B" = NEW."facility"
  ) OR NOT EXISTS (
    SELECT 1 FROM "_Facility_patients" link WHERE link."A" = NEW."facility" AND link."B" = NEW."patient"
  ) OR NOT EXISTS (
    SELECT 1 FROM "_Facility_providers" link WHERE link."A" = NEW."facility" AND link."B" = NEW."attendingProvider"
  ) OR (NEW."encounter" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Encounter" encounter WHERE encounter."id" = NEW."encounter"
      AND encounter."facility" = NEW."facility" AND encounter."patient" = NEW."patient"
  )) THEN RAISE EXCEPTION 'Admission tenant relationships are inconsistent'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Admission_tenant_chain_guard"
BEFORE INSERT OR UPDATE OF "facility", "patient", "encounter", "attendingProvider", "room", "bed" ON "Admission"
FOR EACH ROW EXECUTE FUNCTION "enforce_admission_tenant_chain"();

CREATE OR REPLACE FUNCTION "enforce_care_plan_tenant_chain"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "_Facility_patients" link WHERE link."A" = NEW."facility" AND link."B" = NEW."patient"
  ) OR NOT EXISTS (
    SELECT 1 FROM "_Facility_providers" link WHERE link."A" = NEW."facility" AND link."B" = NEW."provider"
  ) OR (NEW."encounter" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Encounter" encounter WHERE encounter."id" = NEW."encounter"
      AND encounter."facility" = NEW."facility" AND encounter."patient" = NEW."patient"
  )) THEN RAISE EXCEPTION 'Care plan tenant relationships are inconsistent'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CarePlan_tenant_chain_guard"
BEFORE INSERT OR UPDATE OF "facility", "patient", "provider", "encounter" ON "CarePlan"
FOR EACH ROW EXECUTE FUNCTION "enforce_care_plan_tenant_chain"();

-- A provider cannot advertise simultaneous availability at multiple facilities.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ProviderScheduleBlock" left_block
    JOIN "ProviderScheduleBlock" right_block ON left_block."id" < right_block."id"
      AND left_block."provider" = right_block."provider"
      AND left_block."blockType" = 'available' AND right_block."blockType" = 'available'
      AND tsrange(left_block."startsAt", left_block."endsAt", '[)') && tsrange(right_block."startsAt", right_block."endsAt", '[)')
  ) THEN RAISE EXCEPTION 'Overlapping provider availability requires explicit facility review'; END IF;
END $$;
ALTER TABLE "ProviderScheduleBlock" ADD CONSTRAINT "ProviderScheduleBlock_available_no_overlap"
EXCLUDE USING gist (
  "provider" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("provider" IS NOT NULL AND "blockType" = 'available');
