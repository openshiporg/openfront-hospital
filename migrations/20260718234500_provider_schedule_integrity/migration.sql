-- Gate 5: make provider availability and active appointment occupancy durable.
-- The application also takes a provider-scoped advisory transaction lock; these
-- constraints remain the final guard for raw SQL, administrative writes, and races.

CREATE EXTENSION IF NOT EXISTS btree_gist;

UPDATE "ProviderScheduleBlock"
SET "maxAppointments" = 1
WHERE "maxAppointments" IS NULL;

ALTER TABLE "ProviderScheduleBlock"
  ALTER COLUMN "maxAppointments" SET DEFAULT 1,
  ALTER COLUMN "maxAppointments" SET NOT NULL,
  ADD CONSTRAINT "ProviderScheduleBlock_valid_window_check"
    CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "ProviderScheduleBlock_single_capacity_check"
    CHECK ("maxAppointments" = 1);

ALTER TABLE "AppointmentType"
  ADD CONSTRAINT "AppointmentType_duration_bounds_check"
    CHECK ("durationMinutes" BETWEEN 5 AND 480),
  ADD CONSTRAINT "AppointmentType_buffer_before_bounds_check"
    CHECK (COALESCE("bufferBeforeMinutes", 0) BETWEEN 0 AND 240),
  ADD CONSTRAINT "AppointmentType_buffer_after_bounds_check"
    CHECK (COALESCE("bufferAfterMinutes", 0) BETWEEN 0 AND 240);

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_valid_window_check"
    CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "Appointment_active_provider_no_overlap"
    EXCLUDE USING gist (
      "provider" WITH =,
      tsrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE (
      "provider" IS NOT NULL
      AND "status" IN ('requested', 'confirmed', 'checked_in', 'in_visit')
    );

CREATE INDEX "ProviderScheduleBlock_provider_window_idx"
  ON "ProviderScheduleBlock" ("provider", "startsAt", "endsAt");
