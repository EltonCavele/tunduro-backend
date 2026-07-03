CREATE TYPE "WalletTopUpSessionStatus" AS ENUM (
  'OPEN',
  'PAYMENT_FAILED',
  'COMPLETED',
  'EXPIRED'
);

CREATE TABLE "wallet_top_up_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MZN',
  "reference" TEXT NOT NULL,
  "status" "WalletTopUpSessionStatus" NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "checkoutUrl" TEXT,
  "paymentMethod" "PaymentMethod",
  "phone" TEXT,
  "providerPaymentId" TEXT,
  "providerTransactionId" TEXT,
  "providerStatusCode" TEXT,
  "providerMessage" TEXT,
  "failureReason" TEXT,
  "paidAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "wallet_top_up_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_top_up_sessions_reference_key" ON "wallet_top_up_sessions"("reference");
CREATE INDEX "wallet_top_up_sessions_userId_status_createdAt_idx" ON "wallet_top_up_sessions"("userId", "status", "createdAt");
CREATE INDEX "wallet_top_up_sessions_status_expiresAt_idx" ON "wallet_top_up_sessions"("status", "expiresAt");

ALTER TABLE "wallet_top_up_sessions" ADD CONSTRAINT "wallet_top_up_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
