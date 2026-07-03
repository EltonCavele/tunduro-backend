ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'WALLET_TOP_UP';

ALTER TABLE "payment_transactions"
  ADD COLUMN "checkoutSessionId" TEXT,
  ADD COLUMN "walletTopUpSessionId" TEXT,
  ALTER COLUMN "bookingId" DROP NOT NULL;

ALTER TABLE "payment_transactions"
  DROP CONSTRAINT IF EXISTS "payment_transactions_bookingId_fkey";

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "payment_transactions_checkoutSessionId_key"
  ON "payment_transactions"("checkoutSessionId");

CREATE UNIQUE INDEX "payment_transactions_walletTopUpSessionId_key"
  ON "payment_transactions"("walletTopUpSessionId");

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_checkoutSessionId_fkey"
  FOREIGN KEY ("checkoutSessionId") REFERENCES "booking_checkout_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_walletTopUpSessionId_fkey"
  FOREIGN KEY ("walletTopUpSessionId") REFERENCES "wallet_top_up_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
