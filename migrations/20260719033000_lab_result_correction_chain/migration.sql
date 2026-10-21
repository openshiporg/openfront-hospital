-- A result fact may be superseded by at most one direct correction.
-- PostgreSQL unique indexes permit multiple NULLs, so uncorrected results remain valid.
CREATE UNIQUE INDEX "LabResult_supersedesResult_key"
ON "LabResult"("supersedesResult");
