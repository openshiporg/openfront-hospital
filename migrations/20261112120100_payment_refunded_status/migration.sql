-- A payment refunded in full has its own status; allow it and move already fully refunded payments to it.
ALTER TABLE "PatientPayment" DROP CONSTRAINT "PatientPayment_money_check";
ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_money_check" CHECK (length("operationKeyHash") = 64 AND length("requestHash") = 64 AND "amountCents" > 0 AND "refundedAmountCents" >= 0 AND "refundedAmountCents" <= "amountCents" AND "currency" ~ '^[A-Z]{3}$' AND "transitionVersion" >= 1 AND "status" IN ('pending','succeeded','refunded','failed','cancelled'));
UPDATE "PatientPayment" SET "status" = 'refunded', "transitionVersion" = "transitionVersion" + 1
WHERE "status" = 'succeeded' AND "refundedAmountCents" >= "amountCents";
