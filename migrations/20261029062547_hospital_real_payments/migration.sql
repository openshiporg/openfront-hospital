-- Create scoped provider configuration and durable webhook inbox.
ALTER TABLE "PatientPayment" ADD COLUMN "paymentProviderId" TEXT,
ADD COLUMN "providerPaymentId" TEXT;

CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "isInstalled" BOOLEAN NOT NULL DEFAULT false,
    "credentials" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "createPaymentFunction" TEXT NOT NULL DEFAULT '',
    "capturePaymentFunction" TEXT NOT NULL DEFAULT '',
    "refundPaymentFunction" TEXT NOT NULL DEFAULT '',
    "getPaymentStatusFunction" TEXT NOT NULL DEFAULT '',
    "generatePaymentLinkFunction" TEXT NOT NULL DEFAULT '',
    "handleWebhookFunction" TEXT NOT NULL DEFAULT '',
    "facility" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookReceipt" (
    "id" TEXT NOT NULL,
    "receiptKey" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "payloadDigest" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentWebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentProvider_facility_code" ON "PaymentProvider"("facility", "code");
CREATE UNIQUE INDEX "PaymentWebhookReceipt_receiptKey_key" ON "PaymentWebhookReceipt"("receiptKey");
CREATE UNIQUE INDEX "PatientPayment_providerPaymentId_key" ON "PatientPayment"("providerPaymentId");
CREATE INDEX "PatientPayment_paymentProviderId_idx" ON "PatientPayment"("paymentProviderId");
ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_paymentProviderId_fkey" FOREIGN KEY ("paymentProviderId") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentProvider" ADD CONSTRAINT "PaymentProvider_facility_fkey" FOREIGN KEY ("facility") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
