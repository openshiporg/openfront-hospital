-- Reconcile the implicit many-to-many tables with the currently generated
-- Prisma schema. Historical migrations alternated between a composite primary
-- key and an equivalent unique index as Prisma's implicit-relation output
-- changed. Preserve that history and make the current expectation additive.

ALTER TABLE "_AppointmentType_providers"
  ADD CONSTRAINT "_AppointmentType_providers_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_AppointmentType_providers_AB_unique";

ALTER TABLE "_Department_facilities"
  ADD CONSTRAINT "_Department_facilities_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_Department_facilities_AB_unique";

ALTER TABLE "_Facility_patients"
  ADD CONSTRAINT "_Facility_patients_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_Facility_patients_AB_unique";

ALTER TABLE "_Facility_providers"
  ADD CONSTRAINT "_Facility_providers_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_Facility_providers_AB_unique";

ALTER TABLE "_Facility_staff"
  ADD CONSTRAINT "_Facility_staff_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_Facility_staff_AB_unique";
