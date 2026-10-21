-- Add one constrained storefront chrome theme to the existing public hospital profile.
-- The default preserves the current evergreen presentation for every retained row.
ALTER TABLE "HospitalProfile"
  ADD COLUMN "brandTheme" TEXT NOT NULL DEFAULT 'evergreen';

ALTER TABLE "HospitalProfile"
  ADD CONSTRAINT "HospitalProfile_brandTheme_check"
  CHECK ("brandTheme" IN ('evergreen', 'navy', 'plum'));
