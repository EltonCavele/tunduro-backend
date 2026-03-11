-- CreateEnum
CREATE TYPE "CourtType" AS ENUM ('INDOOR', 'OUTDOOR');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('BOOKING', 'RESCHEDULE_FEE', 'RESCHEDULE_DIFFERENCE', 'CANCELLATION_REFUND', 'CANCELLATION_PENALTY', 'WAITLIST_CLAIM', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'ACCEPTED', 'EXPIRED', 'REMOVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpenGameStatus" AS ENUM ('OPEN', 'FULL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpenGameJoinStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "courts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CourtType" NOT NULL,
    "surface" TEXT NOT NULL,
    "hasLighting" BOOLEAN NOT NULL DEFAULT false,
    "rules" TEXT,
    "pricePerHour" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "maxPlayers" INTEGER NOT NULL DEFAULT 4,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_images" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_series" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
    "occurrences" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "seriesId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDueAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkInToken" TEXT,
    "checkInTokenExpiresAt" TIMESTAMP(3),
    "checkInByUserId" TEXT,
    "isAdminForced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_participants" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_invitations" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "inviteeEmail" TEXT,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "reason" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "reference" TEXT NOT NULL,
    "metadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "position" INTEGER NOT NULL,
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_games" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "status" "OpenGameStatus" NOT NULL DEFAULT 'OPEN',
    "slotsTotal" INTEGER NOT NULL,
    "slotsFilled" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_game_join_requests" (
    "id" TEXT NOT NULL,
    "openGameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OpenGameJoinStatus" NOT NULL DEFAULT 'PENDING',
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_game_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_ratings" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courtScore" INTEGER NOT NULL,
    "cleanlinessScore" INTEGER NOT NULL,
    "lightingScore" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "court_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courts_isActive_deletedAt_idx" ON "courts"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "court_images_courtId_sortOrder_idx" ON "court_images"("courtId", "sortOrder");

-- CreateIndex
CREATE INDEX "booking_series_organizerId_status_idx" ON "booking_series"("organizerId", "status");

-- CreateIndex
CREATE INDEX "bookings_courtId_startAt_endAt_idx" ON "bookings"("courtId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "bookings_organizerId_startAt_idx" ON "bookings"("organizerId", "startAt");

-- CreateIndex
CREATE INDEX "bookings_status_paymentDueAt_idx" ON "bookings"("status", "paymentDueAt");

-- CreateIndex
CREATE INDEX "booking_participants_userId_status_idx" ON "booking_participants"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_participants_bookingId_userId_key" ON "booking_participants"("bookingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_invitations_token_key" ON "booking_invitations"("token");

-- CreateIndex
CREATE INDEX "booking_invitations_bookingId_status_idx" ON "booking_invitations"("bookingId", "status");

-- CreateIndex
CREATE INDEX "booking_invitations_invitedUserId_status_idx" ON "booking_invitations"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "booking_status_history_bookingId_createdAt_idx" ON "booking_status_history"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");

-- CreateIndex
CREATE INDEX "payment_transactions_bookingId_status_idx" ON "payment_transactions"("bookingId", "status");

-- CreateIndex
CREATE INDEX "payment_transactions_userId_type_idx" ON "payment_transactions"("userId", "type");

-- CreateIndex
CREATE INDEX "waitlist_entries_courtId_startAt_endAt_status_idx" ON "waitlist_entries"("courtId", "startAt", "endAt", "status");

-- CreateIndex
CREATE INDEX "waitlist_entries_userId_status_idx" ON "waitlist_entries"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_courtId_userId_startAt_endAt_key" ON "waitlist_entries"("courtId", "userId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "open_games_bookingId_key" ON "open_games"("bookingId");

-- CreateIndex
CREATE INDEX "open_games_status_createdAt_idx" ON "open_games"("status", "createdAt");

-- CreateIndex
CREATE INDEX "open_game_join_requests_status_createdAt_idx" ON "open_game_join_requests"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "open_game_join_requests_openGameId_userId_key" ON "open_game_join_requests"("openGameId", "userId");

-- CreateIndex
CREATE INDEX "court_ratings_courtId_createdAt_idx" ON "court_ratings"("courtId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "court_ratings_bookingId_userId_key" ON "court_ratings"("bookingId", "userId");

-- AddForeignKey
ALTER TABLE "court_images" ADD CONSTRAINT "court_images_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "booking_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkInByUserId_fkey" FOREIGN KEY ("checkInByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_participants" ADD CONSTRAINT "booking_participants_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_participants" ADD CONSTRAINT "booking_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_invitations" ADD CONSTRAINT "booking_invitations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_invitations" ADD CONSTRAINT "booking_invitations_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_invitations" ADD CONSTRAINT "booking_invitations_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_games" ADD CONSTRAINT "open_games_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_games" ADD CONSTRAINT "open_games_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_game_join_requests" ADD CONSTRAINT "open_game_join_requests_openGameId_fkey" FOREIGN KEY ("openGameId") REFERENCES "open_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_game_join_requests" ADD CONSTRAINT "open_game_join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_game_join_requests" ADD CONSTRAINT "open_game_join_requests_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_ratings" ADD CONSTRAINT "court_ratings_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_ratings" ADD CONSTRAINT "court_ratings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_ratings" ADD CONSTRAINT "court_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

