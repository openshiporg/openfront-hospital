/*
  Warnings:

  - The primary key for the `_AppointmentType_providers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_Department_facilities` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_Facility_patients` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_Facility_providers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_Facility_staff` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_AppointmentType_providers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_Department_facilities` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_Facility_patients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_Facility_providers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_Facility_staff` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PhiReadAudit" ADD COLUMN     "authority" JSONB,
ADD COLUMN     "correlationReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "operationType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "resourceReferences" JSONB,
ADD COLUMN     "scopeReferences" JSONB;

-- Add the replacement uniqueness guarantees before dropping equivalent composite
-- primary keys. Each source key already proves the data is duplicate-free; this
-- order never opens a write window without a uniqueness constraint.
CREATE UNIQUE INDEX "_AppointmentType_providers_AB_unique" ON "_AppointmentType_providers"("A", "B");
CREATE UNIQUE INDEX "_Department_facilities_AB_unique" ON "_Department_facilities"("A", "B");
CREATE UNIQUE INDEX "_Facility_patients_AB_unique" ON "_Facility_patients"("A", "B");
CREATE UNIQUE INDEX "_Facility_providers_AB_unique" ON "_Facility_providers"("A", "B");
CREATE UNIQUE INDEX "_Facility_staff_AB_unique" ON "_Facility_staff"("A", "B");

ALTER TABLE "_AppointmentType_providers" DROP CONSTRAINT "_AppointmentType_providers_AB_pkey";
ALTER TABLE "_Department_facilities" DROP CONSTRAINT "_Department_facilities_AB_pkey";
ALTER TABLE "_Facility_patients" DROP CONSTRAINT "_Facility_patients_AB_pkey";
ALTER TABLE "_Facility_providers" DROP CONSTRAINT "_Facility_providers_AB_pkey";
ALTER TABLE "_Facility_staff" DROP CONSTRAINT "_Facility_staff_AB_pkey";
