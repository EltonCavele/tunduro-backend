/*
  Warnings:

  - The `lightingDeviceId` column on the `courts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[deviceId]` on the table `lighting_device_states` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deviceId` to the `lighting_device_states` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BookingCheckoutSessionStatus" AS ENUM ('OPEN', 'PAYMENT_FAILED', 'FINALIZING', 'COMPLETED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED');

-- DropIndex
DROP INDEX "courts_lightingDeviceId_idx";

-- DropIndex
DROP INDEX "lighting_device_states_courtId_key";

-- AlterTable
ALTER TABLE "courts" DROP COLUMN "lightingDeviceId",
ADD COLUMN     "lightingDeviceId" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "lighting_device_states" ADD COLUMN     "deviceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "notifyPush" SET DEFAULT false,
ALTER COLUMN "notifySms" SET DEFAULT false;

-- CreateTable
CREATE TABLE "booking_checkout_sessions" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "bookingId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "reference" TEXT NOT NULL,
    "participantUserIds" JSONB,
    "status" "BookingCheckoutSessionStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paysuitePaymentId" TEXT,
    "checkoutUrl" TEXT,
    "paymentMethod" TEXT,
    "refundId" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_checkout_sessions_bookingId_key" ON "booking_checkout_sessions"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_checkout_sessions_reference_key" ON "booking_checkout_sessions"("reference");

-- CreateIndex
CREATE INDEX "booking_checkout_sessions_courtId_startAt_endAt_status_idx" ON "booking_checkout_sessions"("courtId", "startAt", "endAt", "status");

-- CreateIndex
CREATE INDEX "booking_checkout_sessions_organizerId_startAt_status_idx" ON "booking_checkout_sessions"("organizerId", "startAt", "status");

-- CreateIndex
CREATE INDEX "booking_checkout_sessions_status_expiresAt_idx" ON "booking_checkout_sessions"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "booking_checkout_sessions_paysuitePaymentId_idx" ON "booking_checkout_sessions"("paysuitePaymentId");

-- CreateIndex
CREATE INDEX "booking_checkout_sessions_refundId_idx" ON "booking_checkout_sessions"("refundId");

-- CreateIndex
CREATE UNIQUE INDEX "lighting_device_states_deviceId_key" ON "lighting_device_states"("deviceId");

-- CreateIndex
CREATE INDEX "lighting_device_states_courtId_idx" ON "lighting_device_states"("courtId");

-- AddForeignKey
ALTER TABLE "booking_checkout_sessions" ADD CONSTRAINT "booking_checkout_sessions_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_checkout_sessions" ADD CONSTRAINT "booking_checkout_sessions_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_checkout_sessions" ADD CONSTRAINT "booking_checkout_sessions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
