/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `ClinicalAuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `PatientConsent` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[onboardingKey]` on the table `ProviderScheduleBlock` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ClinicalAuditLog" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "PatientConsent" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "ProviderScheduleBlock" ADD COLUMN "onboardingKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProviderScheduleBlock_onboardingKey_key" ON "ProviderScheduleBlock"("onboardingKey");
