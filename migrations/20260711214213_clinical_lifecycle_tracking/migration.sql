-- AlterTable
ALTER TABLE "ClinicalAuditLog" ADD COLUMN     "encounter" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_encounter_idx" ON "ClinicalAuditLog"("encounter");

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_encounter_fkey" FOREIGN KEY ("encounter") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
