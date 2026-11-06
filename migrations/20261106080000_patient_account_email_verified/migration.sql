-- Patient accounts: when the account proved it controls its email (gates which visits it can see).
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
