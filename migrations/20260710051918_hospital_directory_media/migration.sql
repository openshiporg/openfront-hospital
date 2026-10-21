/*
  Warnings:

  - The primary key for the `_AppointmentType_providers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_AppointmentType_providers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "_AppointmentType_providers" DROP CONSTRAINT "_AppointmentType_providers_AB_pkey";

-- CreateTable
CREATE TABLE "ClinicianImage" (
    "id" TEXT NOT NULL,
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "imagePath" TEXT NOT NULL DEFAULT '',
    "altText" TEXT NOT NULL DEFAULT '',
    "order" INTEGER DEFAULT 0,
    "clinician" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicianImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityImage" (
    "id" TEXT NOT NULL,
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "imagePath" TEXT NOT NULL DEFAULT '',
    "altText" TEXT NOT NULL DEFAULT '',
    "order" INTEGER DEFAULT 0,
    "facility" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "facilityType" TEXT NOT NULL DEFAULT 'clinic',
    "status" TEXT NOT NULL DEFAULT 'active',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentImage" (
    "id" TEXT NOT NULL,
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "imagePath" TEXT NOT NULL DEFAULT '',
    "altText" TEXT NOT NULL DEFAULT '',
    "order" INTEGER DEFAULT 0,
    "department" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_Department_facilities" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ClinicianImage_clinician_idx" ON "ClinicianImage"("clinician");

-- CreateIndex
CREATE INDEX "FacilityImage_facility_idx" ON "FacilityImage"("facility");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_slug_key" ON "Facility"("slug");

-- CreateIndex
CREATE INDEX "DepartmentImage_department_idx" ON "DepartmentImage"("department");

-- CreateIndex
CREATE UNIQUE INDEX "_Department_facilities_AB_unique" ON "_Department_facilities"("A", "B");

-- CreateIndex
CREATE INDEX "_Department_facilities_B_index" ON "_Department_facilities"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_AppointmentType_providers_AB_unique" ON "_AppointmentType_providers"("A", "B");

-- AddForeignKey
ALTER TABLE "ClinicianImage" ADD CONSTRAINT "ClinicianImage_clinician_fkey" FOREIGN KEY ("clinician") REFERENCES "Clinician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityImage" ADD CONSTRAINT "FacilityImage_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentImage" ADD CONSTRAINT "DepartmentImage_department_fkey" FOREIGN KEY ("department") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Department_facilities" ADD CONSTRAINT "_Department_facilities_A_fkey" FOREIGN KEY ("A") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Department_facilities" ADD CONSTRAINT "_Department_facilities_B_fkey" FOREIGN KEY ("B") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
