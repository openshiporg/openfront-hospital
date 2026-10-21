-- AlterTable
ALTER TABLE "HospitalProfile" ALTER COLUMN "logoColor" SET DEFAULT '0',
ALTER COLUMN "logoIcon" SET DEFAULT '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 42 48"><path fill="#155eef" fill-rule="evenodd" d="m22.102 20.86 9.9-9.9L29.88 8.84l-7.339 7.339V3h-3v13.178l-7.339-7.34-2.121 2.122 9.9 9.9 1.06 1.06zm2.12 2.121 9.9-9.9 2.121 2.122-7.339 7.339H42v3H28.904l7.34 7.339L34.121 35l-9.9-9.899-1.06-1.06zM7.96 35.001l9.9-9.899 1.06-1.06-1.06-1.061-9.9-9.9-2.121 2.122 7.339 7.339H.002v3h13.176l-7.34 7.339zm12.02-7.777-9.9 9.9 2.122 2.12 7.339-7.338V45h3V31.906l7.339 7.338L32 37.124l-9.9-9.9-1.06-1.061z" clip-rule="evenodd"/></svg>';

-- CreateTable
CREATE TABLE "EpisodeClosurePolicy" (
    "id" TEXT NOT NULL,
    "facility" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "revisionKey" TEXT NOT NULL DEFAULT '',
    "definition" JSONB,
    "reviewReference" TEXT NOT NULL DEFAULT '',
    "reviewedByReference" TEXT NOT NULL DEFAULT '',
    "reviewedRoleReference" TEXT NOT NULL DEFAULT '',
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "originalCommand" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeClosurePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeClosurePolicy_revisionKey_key" ON "EpisodeClosurePolicy"("revisionKey");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeClosurePolicy_operationKeyHash_key" ON "EpisodeClosurePolicy"("operationKeyHash");

-- CreateIndex
CREATE INDEX "EpisodeClosurePolicy_facility_idx" ON "EpisodeClosurePolicy"("facility");

-- AddForeignKey
ALTER TABLE "EpisodeClosurePolicy" ADD CONSTRAINT "EpisodeClosurePolicy_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

