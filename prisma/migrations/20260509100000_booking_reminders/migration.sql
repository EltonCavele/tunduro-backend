-- AlterTable
ALTER TABLE "bookings"
ADD COLUMN "startReminderSentAt" TIMESTAMP(3),
ADD COLUMN "endReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "bookings_status_startReminderSentAt_startAt_idx" ON "bookings"("status", "startReminderSentAt", "startAt");

-- CreateIndex
CREATE INDEX "bookings_status_endReminderSentAt_endAt_idx" ON "bookings"("status", "endReminderSentAt", "endAt");
