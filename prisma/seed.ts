import 'dotenv/config';

import argon2 from 'argon2';
import {
  BookingStatus,
  CourtType,
  Gender,
  InvitationStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentType,
  PrismaClient,
  Role,
} from '@prisma/client';

const prisma = new PrismaClient();

const SEED_PREFIX = 'seed-';
const PASSWORD = 'secret123';
const ADMIN_EMAIL = 'admin@seed.tunduro.local';
const TARGET_BOOKING_EMAIL = 'eltoncavele8@gmail.com';
const BOOKING_DURATION_MINUTES = 60;
const BOOKING_DAYS_AHEAD = 7;

const REQUIRED_TABLES = [
  'users',
  'user_otps',
  'courts',
  'court_images',
  'bookings',
  'booking_participants',
  'booking_invitations',
  'booking_status_history',
  'booking_checkout_sessions',
  'payment_transactions',
  'waitlist_entries',
  'court_ratings',
  'lighting_action_logs',
  'lighting_device_states',
] as const;

const ids = {
  users: {
    admin: `${SEED_PREFIX}user-admin`,
    bookingUser: `${SEED_PREFIX}user-booking-elton`,
  },
  courts: {
    bookingCourt: `${SEED_PREFIX}court-booking`,
  },
  bookings: {
    invited: `${SEED_PREFIX}booking-elton-invited`,
  },
  participants: {
    invitedOrganizer: `${SEED_PREFIX}participant-invited-organizer`,
    invitedGuest: `${SEED_PREFIX}participant-invited-guest`,
  },
  statusHistory: {
    invitedCreated: `${SEED_PREFIX}history-invited-created`,
    invitedConfirmed: `${SEED_PREFIX}history-invited-confirmed`,
  },
  payments: {
    invited: `${SEED_PREFIX}payment-invited-booking`,
  },
  invitations: {
    eltonInvite: `${SEED_PREFIX}invite-elton`,
  },
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function bookingReference(code: string): string {
  return `${SEED_PREFIX}${code}`;
}

function buildOrganizerBookingStarts(now: Date): Date[] {
  const starts: Date[] = [];
  const firstStart = new Date(now);

  firstStart.setMinutes(0, 0, 0);
  firstStart.setHours(firstStart.getHours() + 2);
  starts.push(firstStart);

  for (let dayOffset = 1; dayOffset <= BOOKING_DAYS_AHEAD; dayOffset += 1) {
    const start = addDays(now, dayOffset);
    start.setHours(18, 0, 0, 0);
    starts.push(start);
  }

  return starts;
}

function organizerBookingId(index: number): string {
  return `${SEED_PREFIX}booking-elton-${index}`;
}

function organizerParticipantId(index: number): string {
  return `${SEED_PREFIX}participant-elton-organizer-${index}`;
}

function organizerCreatedHistoryId(index: number): string {
  return `${SEED_PREFIX}history-elton-created-${index}`;
}

function organizerConfirmedHistoryId(index: number): string {
  return `${SEED_PREFIX}history-elton-confirmed-${index}`;
}

function organizerPaymentId(index: number): string {
  return `${SEED_PREFIX}payment-elton-booking-${index}`;
}

function organizerCheckInToken(index: number): string {
  return bookingReference(`checkin-elton-booking-${index}`);
}

function organizerPaymentReference(index: number): string {
  return bookingReference(`payment-elton-booking-${index}`);
}

function buildInvitedBookingStart(now: Date): Date {
  const start = addDays(now, 3);
  start.setHours(20, 0, 0, 0);
  return start;
}

async function assertSchemaIsReady() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `;

  const existingTables = new Set(rows.map(row => row.table_name));
  const missingTables = REQUIRED_TABLES.filter(
    tableName => !existingTables.has(tableName)
  );

  if (missingTables.length > 0) {
    throw new Error(
      [
        'Database schema is incomplete for this seed.',
        `Missing tables: ${missingTables.join(', ')}`,
        'Apply the Prisma schema first with one of these commands:',
        '  npx prisma migrate deploy',
        '  npx prisma db push',
        'Then run:',
        '  npx prisma db seed',
      ].join('\n')
    );
  }
}

async function cleanupSeedData() {
  await prisma.courtRating.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.bookingInvitation.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.bookingParticipant.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.bookingStatusHistory.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.lightingActionLog.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.waitlistEntry.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.bookingCheckoutSession.deleteMany({
    where: {
      OR: [
        { id: { startsWith: SEED_PREFIX } },
        { bookingId: { startsWith: SEED_PREFIX } },
        { courtId: { startsWith: SEED_PREFIX } },
        { organizerId: { startsWith: SEED_PREFIX } },
        { reference: { startsWith: SEED_PREFIX } },
      ],
    },
  });
  await prisma.paymentTransaction.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.booking.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.courtImage.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.lightingDeviceState.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.userOtp.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.court.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
}

async function ensureAdmin(passwordHash: string) {
  return prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      password: passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      isVerified: true,
      phone: '+258840000001',
      gender: Gender.OTHER,
      role: Role.ADMIN,
    },
    create: {
      id: ids.users.admin,
      email: ADMIN_EMAIL,
      password: passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      isVerified: true,
      phone: '+258840000001',
      gender: Gender.OTHER,
      role: Role.ADMIN,
    },
  });
}

async function ensureBookingUser(passwordHash: string) {
  const existingUser = await prisma.user.findUnique({
    where: { email: TARGET_BOOKING_EMAIL },
  });

  if (existingUser) {
    return {
      user: existingUser,
      created: false,
    };
  }

  const createdUser = await prisma.user.create({
    data: {
      id: ids.users.bookingUser,
      email: TARGET_BOOKING_EMAIL,
      password: passwordHash,
      firstName: 'Elton',
      lastName: 'Seed',
      isVerified: true,
      phone: '+258840000099',
      gender: Gender.OTHER,
      role: Role.USER,
    },
  });

  return {
    user: createdUser,
    created: true,
  };
}

async function ensureCourt() {
  const existingCourt = await prisma.court.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (existingCourt) {
    return {
      court: existingCourt,
      created: false,
    };
  }

  const createdCourt = await prisma.court.create({
    data: {
      id: ids.courts.bookingCourt,
      name: 'Seed Booking Court',
      type: CourtType.OUTDOOR,
      surface: 'CLAY',
      hasLighting: false,
      lightingEnabled: false,
      pricePerHour: 1500,
      currency: 'MZN',
      maxPlayers: 4,
      isActive: true,
      rules: 'Court created automatically for booking seed.',
    },
  });

  return {
    court: createdCourt,
    created: true,
  };
}

async function main() {
  const now = new Date();
  const passwordHash = await argon2.hash(PASSWORD);
  const organizerBookingStarts = buildOrganizerBookingStarts(now);
  const invitedBookingStart = buildInvitedBookingStart(now);
  const invitedBookingEnd = addHours(
    invitedBookingStart,
    BOOKING_DURATION_MINUTES / 60
  );

  await assertSchemaIsReady();
  await cleanupSeedData();

  const admin = await ensureAdmin(passwordHash);
  const { user: bookingUser, created: bookingUserCreated } =
    await ensureBookingUser(passwordHash);
  const { court, created: courtCreated } = await ensureCourt();

  const totalPrice = Number(court.pricePerHour) || 1500;
  const organizerBookings = organizerBookingStarts.map((start, index) => {
    const bookingIndex = index + 1;
    const end = addHours(start, BOOKING_DURATION_MINUTES / 60);

    return {
      booking: {
        id: organizerBookingId(bookingIndex),
        courtId: court.id,
        organizerId: bookingUser.id,
        startAt: start,
        endAt: end,
        durationMinutes: BOOKING_DURATION_MINUTES,
        totalPrice,
        currency: court.currency,
        paidAmount: totalPrice,
        status: BookingStatus.CONFIRMED,
        paymentDueAt: addHours(start, -2),
        checkInToken: organizerCheckInToken(bookingIndex),
        checkInTokenExpiresAt: addMinutes(start, 15),
      },
      participant: {
        id: organizerParticipantId(bookingIndex),
        bookingId: organizerBookingId(bookingIndex),
        userId: bookingUser.id,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      createdHistory: {
        id: organizerCreatedHistoryId(bookingIndex),
        bookingId: organizerBookingId(bookingIndex),
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created_by_seed',
        changedByUserId: bookingUser.id,
        createdAt: addMinutes(now, -(bookingIndex * 15)),
      },
      confirmedHistory: {
        id: organizerConfirmedHistoryId(bookingIndex),
        bookingId: organizerBookingId(bookingIndex),
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'booking_paid_by_seed',
        changedByUserId: admin.id,
        createdAt: addMinutes(now, -(bookingIndex * 10)),
      },
      payment: {
        id: organizerPaymentId(bookingIndex),
        bookingId: organizerBookingId(bookingIndex),
        userId: bookingUser.id,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: totalPrice,
        currency: court.currency,
        reference: organizerPaymentReference(bookingIndex),
        processedAt: addMinutes(now, -(bookingIndex * 5)),
        metadata: {
          source: 'seed',
          email: TARGET_BOOKING_EMAIL,
          sequence: bookingIndex,
        },
      },
    };
  });

  await prisma.booking.createMany({
    data: organizerBookings.map(item => item.booking),
  });

  await prisma.booking.create({
    data: {
      id: ids.bookings.invited,
      courtId: court.id,
      organizerId: admin.id,
      startAt: invitedBookingStart,
      endAt: invitedBookingEnd,
      durationMinutes: BOOKING_DURATION_MINUTES,
      totalPrice,
      currency: court.currency,
      paidAmount: totalPrice,
      status: BookingStatus.CONFIRMED,
      paymentDueAt: addHours(invitedBookingStart, -2),
      checkInToken: bookingReference('checkin-elton-invited'),
      checkInTokenExpiresAt: addMinutes(invitedBookingStart, 15),
    },
  });

  await prisma.bookingParticipant.createMany({
    data: [
      ...organizerBookings.map(item => item.participant),
      {
        id: ids.participants.invitedOrganizer,
        bookingId: ids.bookings.invited,
        userId: admin.id,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
    ],
  });

  await prisma.bookingParticipant.create({
    data: {
      id: ids.participants.invitedGuest,
      bookingId: ids.bookings.invited,
      userId: bookingUser.id,
      status: ParticipantStatus.INVITED,
      isOrganizer: false,
    },
  });

  await prisma.bookingInvitation.create({
    data: {
      id: ids.invitations.eltonInvite,
      bookingId: ids.bookings.invited,
      inviterUserId: admin.id,
      invitedUserId: bookingUser.id,
      token: bookingReference('invite-elton-pending'),
      status: InvitationStatus.PENDING,
      expiresAt: addDays(now, 2),
    },
  });

  await prisma.bookingStatusHistory.createMany({
    data: [
      ...organizerBookings.flatMap(item => [
        item.createdHistory,
        item.confirmedHistory,
      ]),
      {
        id: ids.statusHistory.invitedCreated,
        bookingId: ids.bookings.invited,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'invited_booking_created_by_seed',
        changedByUserId: admin.id,
        createdAt: addMinutes(now, -20),
      },
      {
        id: ids.statusHistory.invitedConfirmed,
        bookingId: ids.bookings.invited,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'invited_booking_paid_by_seed',
        changedByUserId: admin.id,
        createdAt: addMinutes(now, -10),
      },
    ],
  });

  await prisma.paymentTransaction.createMany({
    data: [
      ...organizerBookings.map(item => item.payment),
      {
        id: ids.payments.invited,
        bookingId: ids.bookings.invited,
        userId: admin.id,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: totalPrice,
        currency: court.currency,
        reference: bookingReference('payment-elton-invited'),
        processedAt: addMinutes(now, -10),
        metadata: {
          source: 'seed',
          invitedUserEmail: TARGET_BOOKING_EMAIL,
          scenario: 'invited_booking',
        },
      },
    ],
  });

  console.log('Seed completed successfully.');
  console.log(`Admin credentials: ${ADMIN_EMAIL} / ${PASSWORD}`);
  console.log(
    `Organizer bookings seeded for: ${TARGET_BOOKING_EMAIL} (${organizerBookings.length} bookings)`
  );
  console.log(`Invited booking seeded for: ${TARGET_BOOKING_EMAIL}`);
  console.log(
    `Court used: ${court.name}${courtCreated ? ' (created by seed)' : ''}`
  );
  console.log(
    `Organizer booking window: ${organizerBookingStarts[0].toISOString()} -> ${organizerBookingStarts[
      organizerBookingStarts.length - 1
    ].toISOString()}`
  );
  console.log(
    `Invited booking window: ${invitedBookingStart.toISOString()} -> ${invitedBookingEnd.toISOString()}`
  );

  if (bookingUserCreated) {
    console.log(
      `Target user was missing and was created with password: ${PASSWORD}`
    );
  }
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
