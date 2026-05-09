import { PrismaClient, BookingStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const lower = new Date(now.getTime() + 9 * 60_000);
  const upper = new Date(now.getTime() + 11 * 60_000);

  console.log('Window:', { now: now.toISOString(), lower: lower.toISOString(), upper: upper.toISOString() });

  const startCandidates = await prisma.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      startAt: { gte: lower, lte: upper },
      startReminderSentAt: null,
    },
    select: { id: true, startAt: true, startReminderSentAt: true },
  });
  console.log(`start candidates: ${startCandidates.length}`);

  const endCandidates = await prisma.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      endAt: { gte: lower, lte: upper },
      endReminderSentAt: null,
    },
    select: { id: true, endAt: true, endReminderSentAt: true },
  });
  console.log(`end candidates: ${endCandidates.length}`);

  const total = await prisma.booking.count();
  console.log(`total bookings: ${total}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
