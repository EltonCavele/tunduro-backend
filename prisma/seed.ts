import 'dotenv/config';

import argon2 from 'argon2';
import {
  BookingStatus,
  CourtType,
  Gender,
  InvitationStatus,
  LightingActionSource,
  LightingActionType,
  OpenGameJoinStatus,
  OpenGameStatus,
  OvertimeStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentType,
  PrismaClient,
  Role,
  WaitlistStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const SEED_PREFIX = 'seed-';
const PASSWORD = 'secret123';
const REQUIRED_TABLES = [
  'users',
  'user_otps',
  'courts',
  'court_images',
  'booking_series',
  'bookings',
  'booking_participants',
  'booking_invitations',
  'booking_status_history',
  'payment_transactions',
  'waitlist_entries',
  'open_games',
  'open_game_join_requests',
  'court_ratings',
  'lighting_action_logs',
  'lighting_device_states',
  'overtime_requests',
] as const;

const ids = {
  users: {
    admin: `${SEED_PREFIX}user-admin`,
    trainer: `${SEED_PREFIX}user-trainer`,
    alice: `${SEED_PREFIX}user-alice`,
    bob: `${SEED_PREFIX}user-bob`,
    carla: `${SEED_PREFIX}user-carla`,
    daniel: `${SEED_PREFIX}user-daniel`,
    erica: `${SEED_PREFIX}user-erica`,
  },
  userOtps: {
    aliceOtp: `${SEED_PREFIX}otp-alice`,
  },
  courts: {
    sunriseClay: `${SEED_PREFIX}court-sunrise-clay`,
    indoorPro: `${SEED_PREFIX}court-indoor-pro`,
    socialArena: `${SEED_PREFIX}court-social-arena`,
  },
  courtImages: {
    sunrise1: `${SEED_PREFIX}court-image-sunrise-1`,
    sunrise2: `${SEED_PREFIX}court-image-sunrise-2`,
    indoor1: `${SEED_PREFIX}court-image-indoor-1`,
  },
  bookingSeries: {
    weekly: `${SEED_PREFIX}series-weekly`,
  },
  bookings: {
    confirmedFuture: `${SEED_PREFIX}booking-confirmed-future`,
    completed: `${SEED_PREFIX}booking-completed`,
    pending: `${SEED_PREFIX}booking-pending`,
    cancelled: `${SEED_PREFIX}booking-cancelled`,
    noShow: `${SEED_PREFIX}booking-no-show`,
    series1: `${SEED_PREFIX}booking-series-1`,
    series2: `${SEED_PREFIX}booking-series-2`,
    openGame: `${SEED_PREFIX}booking-open-game`,
    waitlistOffer: `${SEED_PREFIX}booking-waitlist-offer`,
    overtime: `${SEED_PREFIX}booking-overtime`,
  },
  participants: {
    confirmedOrganizer: `${SEED_PREFIX}participant-confirmed-organizer`,
    confirmedBob: `${SEED_PREFIX}participant-confirmed-bob`,
    confirmedCarla: `${SEED_PREFIX}participant-confirmed-carla`,
    completedOrganizer: `${SEED_PREFIX}participant-completed-organizer`,
    completedAlice: `${SEED_PREFIX}participant-completed-alice`,
    pendingOrganizer: `${SEED_PREFIX}participant-pending-organizer`,
    cancelledOrganizer: `${SEED_PREFIX}participant-cancelled-organizer`,
    noShowOrganizer: `${SEED_PREFIX}participant-no-show-organizer`,
    series1Organizer: `${SEED_PREFIX}participant-series-1-organizer`,
    series2Organizer: `${SEED_PREFIX}participant-series-2-organizer`,
    openGameOrganizer: `${SEED_PREFIX}participant-open-game-organizer`,
    openGameErica: `${SEED_PREFIX}participant-open-game-erica`,
    openGameBob: `${SEED_PREFIX}participant-open-game-bob`,
    waitlistOfferOrganizer: `${SEED_PREFIX}participant-waitlist-offer-organizer`,
    overtimeOrganizer: `${SEED_PREFIX}participant-overtime-organizer`,
    overtimeDaniel: `${SEED_PREFIX}participant-overtime-daniel`,
  },
  invitations: {
    confirmedPending: `${SEED_PREFIX}invite-confirmed-pending`,
    completedAccepted: `${SEED_PREFIX}invite-completed-accepted`,
    openGameEmail: `${SEED_PREFIX}invite-open-game-email`,
    seriesDeclined: `${SEED_PREFIX}invite-series-declined`,
  },
  statusHistory: {
    confirmedFutureCreated: `${SEED_PREFIX}history-confirmed-future-created`,
    confirmedFutureConfirmed: `${SEED_PREFIX}history-confirmed-future-confirmed`,
    completedCreated: `${SEED_PREFIX}history-completed-created`,
    completedConfirmed: `${SEED_PREFIX}history-completed-confirmed`,
    completedCompleted: `${SEED_PREFIX}history-completed-completed`,
    pendingCreated: `${SEED_PREFIX}history-pending-created`,
    cancelledCreated: `${SEED_PREFIX}history-cancelled-created`,
    cancelledConfirmed: `${SEED_PREFIX}history-cancelled-confirmed`,
    cancelledCancelled: `${SEED_PREFIX}history-cancelled-cancelled`,
    noShowCreated: `${SEED_PREFIX}history-no-show-created`,
    noShowConfirmed: `${SEED_PREFIX}history-no-show-confirmed`,
    noShowNoShow: `${SEED_PREFIX}history-no-show-no-show`,
    series1Created: `${SEED_PREFIX}history-series1-created`,
    series1Confirmed: `${SEED_PREFIX}history-series1-confirmed`,
    series2Created: `${SEED_PREFIX}history-series2-created`,
    openGameCreated: `${SEED_PREFIX}history-open-game-created`,
    openGameConfirmed: `${SEED_PREFIX}history-open-game-confirmed`,
    waitlistOfferCreated: `${SEED_PREFIX}history-waitlist-offer-created`,
    overtimeCreated: `${SEED_PREFIX}history-overtime-created`,
    overtimeConfirmed: `${SEED_PREFIX}history-overtime-confirmed`,
    overtimeExtended: `${SEED_PREFIX}history-overtime-extended`,
  },
  payments: {
    confirmedFutureBooking: `${SEED_PREFIX}payment-confirmed-future-booking`,
    completedBooking: `${SEED_PREFIX}payment-completed-booking`,
    pendingBooking: `${SEED_PREFIX}payment-pending-booking`,
    cancelledBooking: `${SEED_PREFIX}payment-cancelled-booking`,
    cancelledRefund: `${SEED_PREFIX}payment-cancelled-refund`,
    cancelledPenalty: `${SEED_PREFIX}payment-cancelled-penalty`,
    noShowBooking: `${SEED_PREFIX}payment-no-show-booking`,
    series1Booking: `${SEED_PREFIX}payment-series1-booking`,
    series2Booking: `${SEED_PREFIX}payment-series2-booking`,
    openGameBooking: `${SEED_PREFIX}payment-open-game-booking`,
    waitlistClaim: `${SEED_PREFIX}payment-waitlist-claim`,
    overtimeBooking: `${SEED_PREFIX}payment-overtime-booking`,
    overtimeAdjustment: `${SEED_PREFIX}payment-overtime-adjustment`,
  },
  waitlistEntries: {
    offered: `${SEED_PREFIX}waitlist-offered`,
    waiting: `${SEED_PREFIX}waitlist-waiting`,
    accepted: `${SEED_PREFIX}waitlist-accepted`,
  },
  openGames: {
    social: `${SEED_PREFIX}open-game-social`,
  },
  openGameJoinRequests: {
    bobApproved: `${SEED_PREFIX}open-game-request-bob-approved`,
    carlaPending: `${SEED_PREFIX}open-game-request-carla-pending`,
    trainerDeclined: `${SEED_PREFIX}open-game-request-trainer-declined`,
  },
  ratings: {
    completedAlice: `${SEED_PREFIX}rating-completed-alice`,
  },
  lightingActionLogs: {
    autoOn: `${SEED_PREFIX}lighting-log-auto-on`,
    autoOff: `${SEED_PREFIX}lighting-log-auto-off`,
    manualFailed: `${SEED_PREFIX}lighting-log-manual-failed`,
  },
  lightingDeviceStates: {
    sunrise: `${SEED_PREFIX}device-state-sunrise`,
    indoor: `${SEED_PREFIX}device-state-indoor`,
    social: `${SEED_PREFIX}device-state-social`,
  },
  overtimeRequests: {
    pending: `${SEED_PREFIX}overtime-request-pending`,
    paid: `${SEED_PREFIX}overtime-request-paid`,
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
  await prisma.openGameJoinRequest.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.openGame.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
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
  await prisma.overtimeRequest.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.paymentTransaction.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.booking.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
  await prisma.bookingSeries.deleteMany({
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

async function main() {
  const now = new Date();
  const passwordHash = await argon2.hash(PASSWORD);

  const time = {
    completedStart: addDays(now, -5),
    noShowStart: addDays(now, -2),
    cancelledStart: addDays(now, 1),
    pendingStart: addDays(now, 2),
    confirmedFutureStart: addDays(now, 3),
    openGameStart: addDays(now, 4),
    waitlistSlotStart: addDays(now, 5),
    overtimeStart: addDays(now, 6),
    seriesStart1: addDays(now, 7),
    seriesStart2: addDays(now, 14),
  };

  await assertSchemaIsReady();
  await cleanupSeedData();

  await prisma.user.createMany({
    data: [
      {
        id: ids.users.admin,
        email: 'admin@seed.tunduro.local',
        password: passwordHash,
        firstName: 'System',
        lastName: 'Admin',
        avatarUrl: 'https://i.pravatar.cc/200?img=1',
        level: 'ADVANCED',
        favoriteCourt: 'Sunrise Clay',
        preferredTimeSlots: ['18:00-19:00', '19:00-20:00'],
        isVerified: true,
        phone: '+258840000001',
        expoPushToken: 'ExponentPushToken[seed-admin]',
        gender: Gender.OTHER,
        role: Role.ADMIN,
      },
      {
        id: ids.users.trainer,
        email: 'trainer@seed.tunduro.local',
        password: passwordHash,
        firstName: 'Tiago',
        lastName: 'Trainer',
        avatarUrl: 'https://i.pravatar.cc/200?img=2',
        level: 'PRO',
        favoriteCourt: 'Indoor Pro',
        preferredTimeSlots: ['07:00-09:00'],
        isVerified: true,
        phone: '+258840000002',
        expoPushToken: 'ExponentPushToken[seed-trainer]',
        gender: Gender.MALE,
        role: Role.TRAINER,
      },
      {
        id: ids.users.alice,
        email: 'alice@seed.tunduro.local',
        password: passwordHash,
        firstName: 'Alice',
        lastName: 'Matos',
        avatarUrl: 'https://i.pravatar.cc/200?img=3',
        level: 'INTERMEDIATE',
        favoriteCourt: 'Sunrise Clay',
        preferredTimeSlots: ['18:00-20:00'],
        isVerified: true,
        phone: '+258840000003',
        expoPushToken: 'ExponentPushToken[seed-alice]',
        gender: Gender.FEMALE,
      },
      {
        id: ids.users.bob,
        email: 'bob@seed.tunduro.local',
        password: passwordHash,
        firstName: 'Bob',
        lastName: 'Mahumane',
        avatarUrl: 'https://i.pravatar.cc/200?img=4',
        level: 'BEGINNER',
        favoriteCourt: 'Indoor Pro',
        preferredTimeSlots: ['08:00-10:00'],
        isVerified: true,
        phone: '+258840000004',
        expoPushToken: 'ExponentPushToken[seed-bob]',
        gender: Gender.MALE,
      },
      {
        id: ids.users.carla,
        email: 'carla@seed.tunduro.local',
        password: passwordHash,
        firstName: 'Carla',
        lastName: 'Sitoe',
        avatarUrl: 'https://i.pravatar.cc/200?img=5',
        level: 'INTERMEDIATE',
        favoriteCourt: 'Social Arena',
        preferredTimeSlots: ['17:00-18:00'],
        isVerified: true,
        phone: '+258840000005',
        expoPushToken: 'ExponentPushToken[seed-carla]',
        gender: Gender.FEMALE,
      },
      {
        id: ids.users.daniel,
        email: 'daniel@seed.tunduro.local',
        password: passwordHash,
        firstName: 'Daniel',
        lastName: 'Cossa',
        avatarUrl: 'https://i.pravatar.cc/200?img=6',
        level: 'ADVANCED',
        favoriteCourt: 'Sunrise Clay',
        preferredTimeSlots: ['16:00-18:00'],
        isVerified: true,
        phone: '+258840000006',
        expoPushToken: 'ExponentPushToken[seed-daniel]',
        gender: Gender.MALE,
      },
      {
        id: ids.users.erica,
        email: 'erica@seed.tunduro.local',
        password: passwordHash,
        firstName: 'Erica',
        lastName: 'Nhancale',
        avatarUrl: 'https://i.pravatar.cc/200?img=7',
        level: 'BEGINNER',
        favoriteCourt: 'Social Arena',
        preferredTimeSlots: ['20:00-21:00'],
        isVerified: true,
        phone: '+258840000007',
        expoPushToken: 'ExponentPushToken[seed-erica]',
        gender: Gender.FEMALE,
      },
    ],
  });

  await prisma.userOtp.create({
    data: {
      id: ids.userOtps.aliceOtp,
      userId: ids.users.alice,
      otp: '123456',
      expiresAt: addHours(now, 2),
    },
  });

  await prisma.court.createMany({
    data: [
      {
        id: ids.courts.sunriseClay,
        name: 'Sunrise Clay',
        type: CourtType.OUTDOOR,
        surface: 'CLAY',
        hasLighting: true,
        lightingDeviceId: 'seed-tuya-device-001',
        lightingEnabled: true,
        lightingOnOffsetMin: 0,
        lightingOffBufferMin: 5,
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
        quietHoursHardBlock: true,
        rules: 'No glass bottles. Bring court shoes.',
        pricePerHour: 1500,
        currency: 'MZN',
        maxPlayers: 4,
        isActive: true,
      },
      {
        id: ids.courts.indoorPro,
        name: 'Indoor Pro',
        type: CourtType.INDOOR,
        surface: 'HARD',
        hasLighting: true,
        lightingDeviceId: 'seed-tuya-device-002',
        lightingEnabled: true,
        lightingOnOffsetMin: 0,
        lightingOffBufferMin: 10,
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
        quietHoursHardBlock: false,
        rules: 'Indoor only. Clean rackets before entering.',
        pricePerHour: 1800,
        currency: 'MZN',
        maxPlayers: 4,
        isActive: true,
      },
      {
        id: ids.courts.socialArena,
        name: 'Social Arena',
        type: CourtType.OUTDOOR,
        surface: 'SYNTHETIC',
        hasLighting: true,
        lightingDeviceId: null,
        lightingEnabled: true,
        lightingOnOffsetMin: 0,
        lightingOffBufferMin: 5,
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
        quietHoursHardBlock: true,
        rules: 'Ideal for training sessions and social games.',
        pricePerHour: 1200,
        currency: 'MZN',
        maxPlayers: 4,
        isActive: true,
      },
    ],
  });

  await prisma.courtImage.createMany({
    data: [
      {
        id: ids.courtImages.sunrise1,
        courtId: ids.courts.sunriseClay,
        url: 'https://images.unsplash.com/photo-1542144582-1ba00456b5e3',
        sortOrder: 0,
      },
      {
        id: ids.courtImages.sunrise2,
        courtId: ids.courts.sunriseClay,
        url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8',
        sortOrder: 1,
      },
      {
        id: ids.courtImages.indoor1,
        courtId: ids.courts.indoorPro,
        url: 'https://images.unsplash.com/photo-1517649763962-0c623066013b',
        sortOrder: 0,
      },
    ],
  });

  await prisma.bookingSeries.create({
    data: {
      id: ids.bookingSeries.weekly,
      organizerId: ids.users.alice,
      courtId: ids.courts.indoorPro,
      startsAt: time.seriesStart1,
      intervalWeeks: 1,
      occurrences: 2,
      status: 'ACTIVE',
    },
  });

  await prisma.booking.createMany({
    data: [
      {
        id: ids.bookings.confirmedFuture,
        courtId: ids.courts.sunriseClay,
        organizerId: ids.users.alice,
        startAt: time.confirmedFutureStart,
        endAt: addHours(time.confirmedFutureStart, 1),
        durationMinutes: 60,
        totalPrice: 1500,
        currency: 'MZN',
        paidAmount: 1500,
        status: BookingStatus.CONFIRMED,
        paymentDueAt: addMinutes(time.confirmedFutureStart, -30),
        checkInToken: `${SEED_PREFIX}checkin-confirmed-future`,
        checkInTokenExpiresAt: addMinutes(time.confirmedFutureStart, 15),
      },
      {
        id: ids.bookings.completed,
        courtId: ids.courts.sunriseClay,
        organizerId: ids.users.bob,
        startAt: time.completedStart,
        endAt: addHours(time.completedStart, 2),
        durationMinutes: 120,
        totalPrice: 3000,
        currency: 'MZN',
        paidAmount: 3000,
        status: BookingStatus.COMPLETED,
        paymentDueAt: addHours(time.completedStart, -6),
        checkedInAt: addMinutes(time.completedStart, 10),
        checkInToken: `${SEED_PREFIX}checkin-completed`,
        checkInTokenExpiresAt: addMinutes(time.completedStart, 15),
        checkInByUserId: ids.users.bob,
      },
      {
        id: ids.bookings.pending,
        courtId: ids.courts.indoorPro,
        organizerId: ids.users.carla,
        startAt: time.pendingStart,
        endAt: addHours(time.pendingStart, 1),
        durationMinutes: 60,
        totalPrice: 1800,
        currency: 'MZN',
        paidAmount: 0,
        status: BookingStatus.PENDING,
        paymentDueAt: addMinutes(now, 15),
      },
      {
        id: ids.bookings.cancelled,
        courtId: ids.courts.indoorPro,
        organizerId: ids.users.daniel,
        startAt: time.cancelledStart,
        endAt: addHours(time.cancelledStart, 1),
        durationMinutes: 60,
        totalPrice: 1800,
        currency: 'MZN',
        paidAmount: 1800,
        status: BookingStatus.CANCELLED,
        paymentDueAt: addHours(time.cancelledStart, -5),
        cancelledAt: addHours(now, -12),
        cancellationReason: 'schedule_change',
      },
      {
        id: ids.bookings.noShow,
        courtId: ids.courts.sunriseClay,
        organizerId: ids.users.erica,
        startAt: time.noShowStart,
        endAt: addHours(time.noShowStart, 1),
        durationMinutes: 60,
        totalPrice: 1500,
        currency: 'MZN',
        paidAmount: 1500,
        status: BookingStatus.NO_SHOW,
        paymentDueAt: addHours(time.noShowStart, -4),
        cancellationReason: 'auto_no_show',
        checkInToken: `${SEED_PREFIX}checkin-no-show`,
        checkInTokenExpiresAt: addMinutes(time.noShowStart, 15),
      },
      {
        id: ids.bookings.series1,
        courtId: ids.courts.indoorPro,
        organizerId: ids.users.alice,
        seriesId: ids.bookingSeries.weekly,
        startAt: time.seriesStart1,
        endAt: addHours(time.seriesStart1, 1),
        durationMinutes: 60,
        totalPrice: 1800,
        currency: 'MZN',
        paidAmount: 1800,
        status: BookingStatus.CONFIRMED,
        paymentDueAt: addHours(time.seriesStart1, -4),
        checkInToken: `${SEED_PREFIX}checkin-series1`,
        checkInTokenExpiresAt: addMinutes(time.seriesStart1, 15),
      },
      {
        id: ids.bookings.series2,
        courtId: ids.courts.indoorPro,
        organizerId: ids.users.alice,
        seriesId: ids.bookingSeries.weekly,
        startAt: time.seriesStart2,
        endAt: addHours(time.seriesStart2, 1),
        durationMinutes: 60,
        totalPrice: 1800,
        currency: 'MZN',
        paidAmount: 0,
        status: BookingStatus.PENDING,
        paymentDueAt: addMinutes(now, 15),
      },
      {
        id: ids.bookings.openGame,
        courtId: ids.courts.sunriseClay,
        organizerId: ids.users.daniel,
        startAt: time.openGameStart,
        endAt: addHours(time.openGameStart, 2),
        durationMinutes: 120,
        totalPrice: 3000,
        currency: 'MZN',
        paidAmount: 3000,
        status: BookingStatus.CONFIRMED,
        paymentDueAt: addHours(time.openGameStart, -8),
        checkInToken: `${SEED_PREFIX}checkin-open-game`,
        checkInTokenExpiresAt: addMinutes(time.openGameStart, 15),
      },
      {
        id: ids.bookings.waitlistOffer,
        courtId: ids.courts.socialArena,
        organizerId: ids.users.bob,
        startAt: time.waitlistSlotStart,
        endAt: addHours(time.waitlistSlotStart, 1),
        durationMinutes: 60,
        totalPrice: 1200,
        currency: 'MZN',
        paidAmount: 0,
        status: BookingStatus.PENDING,
        paymentDueAt: addMinutes(now, 15),
      },
      {
        id: ids.bookings.overtime,
        courtId: ids.courts.sunriseClay,
        organizerId: ids.users.alice,
        startAt: time.overtimeStart,
        endAt: addHours(time.overtimeStart, 3),
        durationMinutes: 180,
        totalPrice: 4500,
        currency: 'MZN',
        paidAmount: 4500,
        status: BookingStatus.CONFIRMED,
        paymentDueAt: addHours(time.overtimeStart, -8),
        checkInToken: `${SEED_PREFIX}checkin-overtime`,
        checkInTokenExpiresAt: addMinutes(time.overtimeStart, 15),
      },
    ],
  });

  await prisma.bookingParticipant.createMany({
    data: [
      {
        id: ids.participants.confirmedOrganizer,
        bookingId: ids.bookings.confirmedFuture,
        userId: ids.users.alice,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.confirmedBob,
        bookingId: ids.bookings.confirmedFuture,
        userId: ids.users.bob,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: false,
      },
      {
        id: ids.participants.confirmedCarla,
        bookingId: ids.bookings.confirmedFuture,
        userId: ids.users.carla,
        status: ParticipantStatus.INVITED,
        isOrganizer: false,
      },
      {
        id: ids.participants.completedOrganizer,
        bookingId: ids.bookings.completed,
        userId: ids.users.bob,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.completedAlice,
        bookingId: ids.bookings.completed,
        userId: ids.users.alice,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: false,
      },
      {
        id: ids.participants.pendingOrganizer,
        bookingId: ids.bookings.pending,
        userId: ids.users.carla,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.cancelledOrganizer,
        bookingId: ids.bookings.cancelled,
        userId: ids.users.daniel,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.noShowOrganizer,
        bookingId: ids.bookings.noShow,
        userId: ids.users.erica,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.series1Organizer,
        bookingId: ids.bookings.series1,
        userId: ids.users.alice,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.series2Organizer,
        bookingId: ids.bookings.series2,
        userId: ids.users.alice,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.openGameOrganizer,
        bookingId: ids.bookings.openGame,
        userId: ids.users.daniel,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.openGameErica,
        bookingId: ids.bookings.openGame,
        userId: ids.users.erica,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: false,
      },
      {
        id: ids.participants.openGameBob,
        bookingId: ids.bookings.openGame,
        userId: ids.users.bob,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: false,
      },
      {
        id: ids.participants.waitlistOfferOrganizer,
        bookingId: ids.bookings.waitlistOffer,
        userId: ids.users.bob,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.overtimeOrganizer,
        bookingId: ids.bookings.overtime,
        userId: ids.users.alice,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: true,
      },
      {
        id: ids.participants.overtimeDaniel,
        bookingId: ids.bookings.overtime,
        userId: ids.users.daniel,
        status: ParticipantStatus.ACCEPTED,
        isOrganizer: false,
      },
    ],
  });

  await prisma.bookingInvitation.createMany({
    data: [
      {
        id: ids.invitations.confirmedPending,
        bookingId: ids.bookings.confirmedFuture,
        inviterUserId: ids.users.alice,
        invitedUserId: ids.users.carla,
        token: bookingReference('token-confirmed-pending'),
        status: InvitationStatus.PENDING,
        expiresAt: addHours(now, 24),
      },
      {
        id: ids.invitations.completedAccepted,
        bookingId: ids.bookings.completed,
        inviterUserId: ids.users.bob,
        invitedUserId: ids.users.alice,
        token: bookingReference('token-completed-accepted'),
        status: InvitationStatus.ACCEPTED,
        expiresAt: addHours(time.completedStart, 12),
        respondedAt: addHours(time.completedStart, -2),
      },
      {
        id: ids.invitations.openGameEmail,
        bookingId: ids.bookings.openGame,
        inviterUserId: ids.users.daniel,
        inviteeEmail: 'guest.player@seed.tunduro.local',
        token: bookingReference('token-open-game-email'),
        status: InvitationStatus.PENDING,
        expiresAt: addHours(now, 24),
      },
      {
        id: ids.invitations.seriesDeclined,
        bookingId: ids.bookings.series1,
        inviterUserId: ids.users.alice,
        invitedUserId: ids.users.trainer,
        token: bookingReference('token-series-declined'),
        status: InvitationStatus.DECLINED,
        expiresAt: addHours(now, 24),
        respondedAt: addHours(now, -1),
      },
    ],
  });

  await prisma.bookingStatusHistory.createMany({
    data: [
      {
        id: ids.statusHistory.confirmedFutureCreated,
        bookingId: ids.bookings.confirmedFuture,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.alice,
        createdAt: addHours(now, -4),
      },
      {
        id: ids.statusHistory.confirmedFutureConfirmed,
        bookingId: ids.bookings.confirmedFuture,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'payment_confirmed',
        changedByUserId: ids.users.alice,
        createdAt: addHours(now, -3),
      },
      {
        id: ids.statusHistory.completedCreated,
        bookingId: ids.bookings.completed,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.bob,
        createdAt: addDays(time.completedStart, -1),
      },
      {
        id: ids.statusHistory.completedConfirmed,
        bookingId: ids.bookings.completed,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'payment_confirmed',
        changedByUserId: ids.users.bob,
        createdAt: addHours(time.completedStart, -3),
      },
      {
        id: ids.statusHistory.completedCompleted,
        bookingId: ids.bookings.completed,
        fromStatus: BookingStatus.CONFIRMED,
        toStatus: BookingStatus.COMPLETED,
        reason: 'auto_completed',
        changedByUserId: ids.users.admin,
        createdAt: addHours(time.completedStart, 3),
      },
      {
        id: ids.statusHistory.pendingCreated,
        bookingId: ids.bookings.pending,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.carla,
        createdAt: addHours(now, -1),
      },
      {
        id: ids.statusHistory.cancelledCreated,
        bookingId: ids.bookings.cancelled,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.daniel,
        createdAt: addDays(now, -3),
      },
      {
        id: ids.statusHistory.cancelledConfirmed,
        bookingId: ids.bookings.cancelled,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'payment_confirmed',
        changedByUserId: ids.users.daniel,
        createdAt: addDays(now, -2),
      },
      {
        id: ids.statusHistory.cancelledCancelled,
        bookingId: ids.bookings.cancelled,
        fromStatus: BookingStatus.CONFIRMED,
        toStatus: BookingStatus.CANCELLED,
        reason: 'schedule_change',
        changedByUserId: ids.users.daniel,
        createdAt: addHours(now, -12),
      },
      {
        id: ids.statusHistory.noShowCreated,
        bookingId: ids.bookings.noShow,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.erica,
        createdAt: addDays(time.noShowStart, -1),
      },
      {
        id: ids.statusHistory.noShowConfirmed,
        bookingId: ids.bookings.noShow,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'payment_confirmed',
        changedByUserId: ids.users.erica,
        createdAt: addHours(time.noShowStart, -3),
      },
      {
        id: ids.statusHistory.noShowNoShow,
        bookingId: ids.bookings.noShow,
        fromStatus: BookingStatus.CONFIRMED,
        toStatus: BookingStatus.NO_SHOW,
        reason: 'auto_no_show',
        changedByUserId: ids.users.admin,
        createdAt: addMinutes(time.noShowStart, 90),
      },
      {
        id: ids.statusHistory.series1Created,
        bookingId: ids.bookings.series1,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.alice,
        createdAt: addHours(now, -2),
      },
      {
        id: ids.statusHistory.series1Confirmed,
        bookingId: ids.bookings.series1,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'payment_confirmed',
        changedByUserId: ids.users.alice,
        createdAt: addHours(now, -1),
      },
      {
        id: ids.statusHistory.series2Created,
        bookingId: ids.bookings.series2,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.alice,
        createdAt: addMinutes(now, -30),
      },
      {
        id: ids.statusHistory.openGameCreated,
        bookingId: ids.bookings.openGame,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.daniel,
        createdAt: addHours(now, -6),
      },
      {
        id: ids.statusHistory.openGameConfirmed,
        bookingId: ids.bookings.openGame,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'payment_confirmed',
        changedByUserId: ids.users.daniel,
        createdAt: addHours(now, -5),
      },
      {
        id: ids.statusHistory.waitlistOfferCreated,
        bookingId: ids.bookings.waitlistOffer,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'waitlist_offer_generated',
        changedByUserId: ids.users.admin,
        createdAt: addMinutes(now, -20),
      },
      {
        id: ids.statusHistory.overtimeCreated,
        bookingId: ids.bookings.overtime,
        fromStatus: null,
        toStatus: BookingStatus.PENDING,
        reason: 'booking_created',
        changedByUserId: ids.users.alice,
        createdAt: addHours(now, -10),
      },
      {
        id: ids.statusHistory.overtimeConfirmed,
        bookingId: ids.bookings.overtime,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'payment_confirmed',
        changedByUserId: ids.users.alice,
        createdAt: addHours(now, -9),
      },
      {
        id: ids.statusHistory.overtimeExtended,
        bookingId: ids.bookings.overtime,
        fromStatus: BookingStatus.CONFIRMED,
        toStatus: BookingStatus.CONFIRMED,
        reason: 'overtime_paid_extension',
        changedByUserId: ids.users.admin,
        createdAt: addHours(now, -8),
      },
    ],
  });

  await prisma.paymentTransaction.createMany({
    data: [
      {
        id: ids.payments.confirmedFutureBooking,
        bookingId: ids.bookings.confirmedFuture,
        userId: ids.users.alice,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: 1500,
        currency: 'MZN',
        reference: bookingReference('pay-confirmed-future'),
        processedAt: addHours(now, -3),
        metadata: { source: 'seed', scenario: 'confirmed_future' },
      },
      {
        id: ids.payments.completedBooking,
        bookingId: ids.bookings.completed,
        userId: ids.users.bob,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: 3000,
        currency: 'MZN',
        reference: bookingReference('pay-completed'),
        processedAt: addHours(time.completedStart, -3),
        metadata: { source: 'seed', scenario: 'completed' },
      },
      {
        id: ids.payments.pendingBooking,
        bookingId: ids.bookings.pending,
        userId: ids.users.carla,
        type: PaymentType.BOOKING,
        status: PaymentStatus.PENDING,
        amount: 1800,
        currency: 'MZN',
        reference: bookingReference('pay-pending'),
        metadata: { source: 'seed', scenario: 'pending' },
      },
      {
        id: ids.payments.cancelledBooking,
        bookingId: ids.bookings.cancelled,
        userId: ids.users.daniel,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: 1800,
        currency: 'MZN',
        reference: bookingReference('pay-cancelled-booking'),
        processedAt: addDays(now, -2),
        metadata: { source: 'seed', scenario: 'cancelled' },
      },
      {
        id: ids.payments.cancelledRefund,
        bookingId: ids.bookings.cancelled,
        userId: ids.users.daniel,
        type: PaymentType.CANCELLATION_REFUND,
        status: PaymentStatus.COMPLETED,
        amount: 900,
        currency: 'MZN',
        reference: bookingReference('pay-cancelled-refund'),
        processedAt: addHours(now, -11),
        metadata: { source: 'seed', policy: '50_percent_refund' },
      },
      {
        id: ids.payments.cancelledPenalty,
        bookingId: ids.bookings.cancelled,
        userId: ids.users.daniel,
        type: PaymentType.CANCELLATION_PENALTY,
        status: PaymentStatus.COMPLETED,
        amount: 900,
        currency: 'MZN',
        reference: bookingReference('pay-cancelled-penalty'),
        processedAt: addHours(now, -11),
        metadata: { source: 'seed', policy: '50_percent_penalty' },
      },
      {
        id: ids.payments.noShowBooking,
        bookingId: ids.bookings.noShow,
        userId: ids.users.erica,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: 1500,
        currency: 'MZN',
        reference: bookingReference('pay-no-show'),
        processedAt: addHours(time.noShowStart, -3),
        metadata: { source: 'seed', scenario: 'no_show' },
      },
      {
        id: ids.payments.series1Booking,
        bookingId: ids.bookings.series1,
        userId: ids.users.alice,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: 1800,
        currency: 'MZN',
        reference: bookingReference('pay-series1'),
        processedAt: addHours(now, -1),
        metadata: { source: 'seed', scenario: 'series_confirmed' },
      },
      {
        id: ids.payments.series2Booking,
        bookingId: ids.bookings.series2,
        userId: ids.users.alice,
        type: PaymentType.BOOKING,
        status: PaymentStatus.PENDING,
        amount: 1800,
        currency: 'MZN',
        reference: bookingReference('pay-series2'),
        metadata: { source: 'seed', scenario: 'series_pending' },
      },
      {
        id: ids.payments.openGameBooking,
        bookingId: ids.bookings.openGame,
        userId: ids.users.daniel,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: 3000,
        currency: 'MZN',
        reference: bookingReference('pay-open-game'),
        processedAt: addHours(now, -5),
        metadata: { source: 'seed', scenario: 'open_game' },
      },
      {
        id: ids.payments.waitlistClaim,
        bookingId: ids.bookings.waitlistOffer,
        userId: ids.users.bob,
        type: PaymentType.WAITLIST_CLAIM,
        status: PaymentStatus.PENDING,
        amount: 1200,
        currency: 'MZN',
        reference: bookingReference('pay-waitlist-claim'),
        metadata: { source: 'seed', scenario: 'waitlist_offer' },
      },
      {
        id: ids.payments.overtimeBooking,
        bookingId: ids.bookings.overtime,
        userId: ids.users.alice,
        type: PaymentType.BOOKING,
        status: PaymentStatus.COMPLETED,
        amount: 3000,
        currency: 'MZN',
        reference: bookingReference('pay-overtime-booking'),
        processedAt: addHours(now, -9),
        metadata: { source: 'seed', scenario: 'overtime_booking' },
      },
      {
        id: ids.payments.overtimeAdjustment,
        bookingId: ids.bookings.overtime,
        userId: ids.users.alice,
        type: PaymentType.OVERTIME_ADJUSTMENT,
        status: PaymentStatus.COMPLETED,
        amount: 1500,
        currency: 'MZN',
        reference: bookingReference('pay-overtime-adjustment'),
        processedAt: addHours(now, -8),
        metadata: { source: 'seed', scenario: 'overtime_paid', blocks: 1 },
      },
    ],
  });

  await prisma.waitlistEntry.createMany({
    data: [
      {
        id: ids.waitlistEntries.offered,
        courtId: ids.courts.socialArena,
        userId: ids.users.erica,
        bookingId: ids.bookings.waitlistOffer,
        startAt: time.waitlistSlotStart,
        endAt: addHours(time.waitlistSlotStart, 1),
        status: WaitlistStatus.OFFERED,
        position: 1,
        offeredAt: addMinutes(now, -10),
        offerExpiresAt: addMinutes(now, 20),
      },
      {
        id: ids.waitlistEntries.waiting,
        courtId: ids.courts.socialArena,
        userId: ids.users.carla,
        startAt: time.waitlistSlotStart,
        endAt: addHours(time.waitlistSlotStart, 1),
        status: WaitlistStatus.WAITING,
        position: 2,
      },
      {
        id: ids.waitlistEntries.accepted,
        courtId: ids.courts.sunriseClay,
        userId: ids.users.bob,
        bookingId: ids.bookings.confirmedFuture,
        startAt: time.confirmedFutureStart,
        endAt: addHours(time.confirmedFutureStart, 1),
        status: WaitlistStatus.ACCEPTED,
        position: 1,
        offeredAt: addDays(now, -1),
        offerExpiresAt: addDays(now, -1),
      },
    ],
  });

  await prisma.openGame.create({
    data: {
      id: ids.openGames.social,
      bookingId: ids.bookings.openGame,
      organizerId: ids.users.daniel,
      title: 'Need 1 more player',
      description: 'Friendly intermediate doubles session.',
      status: OpenGameStatus.OPEN,
      slotsTotal: 4,
      slotsFilled: 3,
    },
  });

  await prisma.openGameJoinRequest.createMany({
    data: [
      {
        id: ids.openGameJoinRequests.bobApproved,
        openGameId: ids.openGames.social,
        userId: ids.users.bob,
        status: OpenGameJoinStatus.APPROVED,
        respondedById: ids.users.daniel,
        respondedAt: addHours(now, -4),
      },
      {
        id: ids.openGameJoinRequests.carlaPending,
        openGameId: ids.openGames.social,
        userId: ids.users.carla,
        status: OpenGameJoinStatus.PENDING,
      },
      {
        id: ids.openGameJoinRequests.trainerDeclined,
        openGameId: ids.openGames.social,
        userId: ids.users.trainer,
        status: OpenGameJoinStatus.DECLINED,
        respondedById: ids.users.daniel,
        respondedAt: addHours(now, -2),
      },
    ],
  });

  await prisma.courtRating.create({
    data: {
      id: ids.ratings.completedAlice,
      courtId: ids.courts.sunriseClay,
      bookingId: ids.bookings.completed,
      userId: ids.users.alice,
      courtScore: 5,
      cleanlinessScore: 4,
      lightingScore: 5,
      comment: 'Great session, court was clean and lighting was excellent.',
    },
  });

  await prisma.lightingActionLog.createMany({
    data: [
      {
        id: ids.lightingActionLogs.autoOn,
        courtId: ids.courts.sunriseClay,
        bookingId: ids.bookings.confirmedFuture,
        source: LightingActionSource.SYSTEM,
        action: LightingActionType.AUTO_ON,
        reason: 'booking_started',
        success: true,
        attempts: 1,
        createdAt: addMinutes(now, -30),
      },
      {
        id: ids.lightingActionLogs.autoOff,
        courtId: ids.courts.sunriseClay,
        bookingId: ids.bookings.completed,
        source: LightingActionSource.SYSTEM,
        action: LightingActionType.AUTO_OFF,
        reason: 'booking_ended',
        success: true,
        attempts: 1,
        createdAt: addDays(now, -4),
      },
      {
        id: ids.lightingActionLogs.manualFailed,
        courtId: ids.courts.socialArena,
        bookingId: null,
        requestedByUserId: ids.users.admin,
        source: LightingActionSource.ADMIN,
        action: LightingActionType.MANUAL_ON,
        reason: 'manual_test_without_mapping',
        success: false,
        attempts: 3,
        errorCode: 'missing_device_mapping',
        errorMessage: 'Court has no Tuya device mapping',
        createdAt: addMinutes(now, -5),
      },
    ],
  });

  await prisma.lightingDeviceState.createMany({
    data: [
      {
        id: ids.lightingDeviceStates.sunrise,
        courtId: ids.courts.sunriseClay,
        isOnline: true,
        lastPingAt: addMinutes(now, -2),
        lastCommandAt: addMinutes(now, -30),
        lastCommandAction: LightingActionType.AUTO_ON,
        lastCommandSuccess: true,
      },
      {
        id: ids.lightingDeviceStates.indoor,
        courtId: ids.courts.indoorPro,
        isOnline: false,
        lastPingAt: addMinutes(now, -7),
        lastCommandAt: addMinutes(now, -8),
        lastCommandAction: LightingActionType.STATUS_SYNC,
        lastCommandSuccess: false,
        lastError: 'Device offline during ping',
      },
      {
        id: ids.lightingDeviceStates.social,
        courtId: ids.courts.socialArena,
        isOnline: false,
        lastPingAt: addMinutes(now, -3),
        lastCommandAt: addMinutes(now, -5),
        lastCommandAction: LightingActionType.MANUAL_ON,
        lastCommandSuccess: false,
        lastError: 'Court has no device mapping',
      },
    ],
  });

  await prisma.overtimeRequest.createMany({
    data: [
      {
        id: ids.overtimeRequests.pending,
        bookingId: ids.bookings.confirmedFuture,
        requestedByUserId: ids.users.alice,
        blocks: 2,
        status: OvertimeStatus.PENDING,
      },
      {
        id: ids.overtimeRequests.paid,
        bookingId: ids.bookings.overtime,
        requestedByUserId: ids.users.alice,
        approvedByUserId: ids.users.admin,
        blocks: 1,
        status: OvertimeStatus.PAID,
        paymentTransactionId: ids.payments.overtimeAdjustment,
        expiresAt: addHours(now, -7),
        processedAt: addHours(now, -8),
      },
    ],
  });

  console.log('Seed completed successfully.');
  console.log('Login credentials:');
  console.log('  admin@seed.tunduro.local / secret123');
  console.log('  alice@seed.tunduro.local / secret123');
  console.log('  bob@seed.tunduro.local / secret123');
  console.log('  carla@seed.tunduro.local / secret123');
  console.log('  daniel@seed.tunduro.local / secret123');
  console.log('  erica@seed.tunduro.local / secret123');
  console.log('  trainer@seed.tunduro.local / secret123');
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
