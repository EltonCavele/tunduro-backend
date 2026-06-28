-- Add member pricing, optional booking lighting, and club wallet balance.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEMBER';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CLUB_BALANCE';

CREATE TYPE "WalletTransactionType" AS ENUM (
  'TOP_UP',
  'BOOKING_DEBIT',
  'ADMIN_ADJUSTMENT'
);

ALTER TABLE "courts"
ADD COLUMN "memberPricePerHour" DECIMAL(10,2),
ADD COLUMN "lightingPricePerHour" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "courts"
SET "memberPricePerHour" = "pricePerHour"
WHERE "memberPricePerHour" IS NULL;

ALTER TABLE "courts"
ALTER COLUMN "memberPricePerHour" SET NOT NULL,
ALTER COLUMN "memberPricePerHour" SET DEFAULT 0;

ALTER TABLE "bookings"
ADD COLUMN "lightingRequested" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "booking_checkout_sessions"
ADD COLUMN "lightingRequested" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "wallets" (
  "userId" TEXT NOT NULL,
  "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'MZN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "wallet_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "type" "WalletTransactionType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "balanceAfter" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MZN',
  "reference" TEXT NOT NULL,
  "bookingId" TEXT,
  "paymentReference" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_transactions_reference_key" ON "wallet_transactions"("reference");
CREATE INDEX "wallet_transactions_userId_createdAt_idx" ON "wallet_transactions"("userId", "createdAt");
CREATE INDEX "wallet_transactions_createdByUserId_idx" ON "wallet_transactions"("createdByUserId");
CREATE INDEX "wallet_transactions_bookingId_idx" ON "wallet_transactions"("bookingId");

ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_transactions"
ADD CONSTRAINT "wallet_transactions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_transactions"
ADD CONSTRAINT "wallet_transactions_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
