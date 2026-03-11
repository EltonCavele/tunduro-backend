-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'OVERTIME_ADJUSTMENT';

-- CreateEnum
CREATE TYPE "LightingActionSource" AS ENUM ('SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "LightingActionType" AS ENUM ('AUTO_ON', 'AUTO_OFF', 'MANUAL_ON', 'MANUAL_OFF', 'EXTEND', 'TEST_SWITCH', 'STATUS_SYNC');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'PAYMENT_PENDING', 'PAID', 'EXPIRED');

-- AlterTable
ALTER TABLE "courts"
ADD COLUMN     "lightingDeviceId" TEXT,
ADD COLUMN     "lightingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lightingOnOffsetMin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lightingOffBufferMin" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "quietHoursEnd" TEXT NOT NULL DEFAULT '06:00',
ADD COLUMN     "quietHoursHardBlock" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "lighting_action_logs" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "bookingId" TEXT,
    "requestedByUserId" TEXT,
    "source" "LightingActionSource" NOT NULL,
    "action" "LightingActionType" NOT NULL,
    "reason" TEXT,
    "success" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lighting_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lighting_device_states" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastPingAt" TIMESTAMP(3),
    "lastCommandAt" TIMESTAMP(3),
    "lastCommandAction" "LightingActionType",
    "lastCommandSuccess" BOOLEAN,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lighting_device_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "blocks" INTEGER NOT NULL,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUserId" TEXT,
    "declineReason" TEXT,
    "paymentTransactionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courts_lightingDeviceId_idx" ON "courts"("lightingDeviceId");

-- CreateIndex
CREATE INDEX "lighting_action_logs_courtId_createdAt_idx" ON "lighting_action_logs"("courtId", "createdAt");

-- CreateIndex
CREATE INDEX "lighting_action_logs_bookingId_createdAt_idx" ON "lighting_action_logs"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "lighting_action_logs_success_createdAt_idx" ON "lighting_action_logs"("success", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lighting_device_states_courtId_key" ON "lighting_device_states"("courtId");

-- CreateIndex
CREATE INDEX "lighting_device_states_isOnline_updatedAt_idx" ON "lighting_device_states"("isOnline", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_paymentTransactionId_key" ON "overtime_requests"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "overtime_requests_bookingId_status_idx" ON "overtime_requests"("bookingId", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_requestedByUserId_status_idx" ON "overtime_requests"("requestedByUserId", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_status_createdAt_idx" ON "overtime_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "lighting_action_logs" ADD CONSTRAINT "lighting_action_logs_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lighting_action_logs" ADD CONSTRAINT "lighting_action_logs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lighting_action_logs" ADD CONSTRAINT "lighting_action_logs_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lighting_device_states" ADD CONSTRAINT "lighting_device_states_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
