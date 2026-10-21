/*
  Warnings:

  - You are about to drop the column `canCreateTodos` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the column `canManageAllTodos` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the `Todo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TodoImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_Todo_todoImages` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Todo" DROP CONSTRAINT "Todo_assignedTo_fkey";

-- DropForeignKey
ALTER TABLE "_Todo_todoImages" DROP CONSTRAINT "_Todo_todoImages_A_fkey";

-- DropForeignKey
ALTER TABLE "_Todo_todoImages" DROP CONSTRAINT "_Todo_todoImages_B_fkey";

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "canCreateTodos",
DROP COLUMN "canManageAllTodos",
ADD COLUMN     "canManageAppointments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageCommunications" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageIntake" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManagePatients" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageProviders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageScheduling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewReports" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started';

-- DropTable
DROP TABLE "Todo";

-- DropTable
DROP TABLE "TodoImage";

-- DropTable
DROP TABLE "_Todo_todoImages";

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "preferredContactMethod" TEXT DEFAULT 'phone',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "insuranceSummary" JSONB,
    "notes" TEXT NOT NULL DEFAULT '',
    "portalAccess" TEXT,
    "user" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "credentials" TEXT NOT NULL DEFAULT '',
    "specialty" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "bio" TEXT NOT NULL DEFAULT '',
    "locationName" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'bookable',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "bufferBeforeMinutes" INTEGER DEFAULT 0,
    "bufferAfterMinutes" INTEGER DEFAULT 0,
    "priceCents" INTEGER DEFAULT 0,
    "intakeRequirements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderScheduleBlock" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "blockType" TEXT NOT NULL DEFAULT 'available',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "recurrenceRule" TEXT NOT NULL DEFAULT '',
    "maxAppointments" INTEGER DEFAULT 1,
    "locationName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "appointmentNumber" TEXT NOT NULL DEFAULT '',
    "bookingLockKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "patient" TEXT,
    "provider" TEXT,
    "appointmentType" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "locationName" TEXT NOT NULL DEFAULT '',
    "reasonForVisit" TEXT NOT NULL DEFAULT '',
    "source" TEXT DEFAULT 'front_desk',
    "estimatedFeeCents" INTEGER DEFAULT 0,
    "checkInAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "operationalNotes" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeForm" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Patient intake',
    "status" TEXT NOT NULL DEFAULT 'not_sent',
    "patient" TEXT,
    "appointment" TEXT,
    "templateKey" TEXT NOT NULL DEFAULT 'new_patient',
    "accessCode" TEXT NOT NULL DEFAULT '',
    "formSchema" JSONB,
    "responses" JSONB,
    "sentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMessage" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "appointment" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "externalId" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPortalAccess" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "inviteEmail" TEXT NOT NULL DEFAULT '',
    "inviteTokenDigest" TEXT NOT NULL DEFAULT '',
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AppointmentType_providers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_portalAccess_key" ON "Patient"("portalAccess");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_user_key" ON "Patient"("user");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_user_key" ON "Provider"("user");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentType_slug_key" ON "AppointmentType"("slug");

-- CreateIndex
CREATE INDEX "ProviderScheduleBlock_provider_idx" ON "ProviderScheduleBlock"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_appointmentNumber_key" ON "Appointment"("appointmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_bookingLockKey_key" ON "Appointment"("bookingLockKey");

-- CreateIndex
CREATE INDEX "Appointment_patient_idx" ON "Appointment"("patient");

-- CreateIndex
CREATE INDEX "Appointment_provider_idx" ON "Appointment"("provider");

-- CreateIndex
CREATE INDEX "Appointment_appointmentType_idx" ON "Appointment"("appointmentType");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeForm_accessCode_key" ON "IntakeForm"("accessCode");

-- CreateIndex
CREATE INDEX "IntakeForm_patient_idx" ON "IntakeForm"("patient");

-- CreateIndex
CREATE INDEX "IntakeForm_appointment_idx" ON "IntakeForm"("appointment");

-- CreateIndex
CREATE INDEX "IntakeForm_reviewedBy_idx" ON "IntakeForm"("reviewedBy");

-- CreateIndex
CREATE INDEX "PatientMessage_patient_idx" ON "PatientMessage"("patient");

-- CreateIndex
CREATE INDEX "PatientMessage_appointment_idx" ON "PatientMessage"("appointment");

-- CreateIndex
CREATE INDEX "PatientMessage_externalId_idx" ON "PatientMessage"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalAccess_user_key" ON "PatientPortalAccess"("user");

-- CreateIndex
CREATE UNIQUE INDEX "_AppointmentType_providers_AB_unique" ON "_AppointmentType_providers"("A", "B");

-- CreateIndex
CREATE INDEX "_AppointmentType_providers_B_index" ON "_AppointmentType_providers"("B");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_portalAccess_fkey" FOREIGN KEY ("portalAccess") REFERENCES "PatientPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderScheduleBlock" ADD CONSTRAINT "ProviderScheduleBlock_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_provider_fkey" FOREIGN KEY ("provider") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentType_fkey" FOREIGN KEY ("appointmentType") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalAccess" ADD CONSTRAINT "PatientPortalAccess_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AppointmentType_providers" ADD CONSTRAINT "_AppointmentType_providers_A_fkey" FOREIGN KEY ("A") REFERENCES "AppointmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AppointmentType_providers" ADD CONSTRAINT "_AppointmentType_providers_B_fkey" FOREIGN KEY ("B") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
