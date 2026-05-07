-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA', 'EMOLA', 'CASH', 'CARD');

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN "method" "PaymentMethod",
ADD COLUMN "confirmedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "payment_transactions_confirmedByUserId_idx" ON "payment_transactions"("confirmedByUserId");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable
DROP TABLE IF EXISTS "booking_checkout_sessions";

-- DropEnum
DROP TYPE IF EXISTS "BookingCheckoutSessionStatus";
