-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "payment_transactions"
ADD COLUMN "phone" TEXT,
ADD COLUMN "providerTransactionId" TEXT,
ADD COLUMN "providerStatusCode" TEXT,
ADD COLUMN "providerMessage" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
