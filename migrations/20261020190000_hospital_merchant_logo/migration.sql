-- Additive source migration. UNAPPLIED; generation and disposable migration proof pending.
-- Existing profile rows retain NULL and keep their saved preset until explicitly saved.
ALTER TABLE "HospitalProfile" ADD COLUMN "logoIcon" TEXT;
ALTER TABLE "HospitalProfile" ADD COLUMN "logoColor" TEXT;
