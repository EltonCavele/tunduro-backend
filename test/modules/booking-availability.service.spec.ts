import { HttpException } from '@nestjs/common';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingAvailabilityService } from 'src/modules/booking/services/booking-availability.service';

describe('BookingAvailabilityService', () => {
  const db = {
    booking: {
      count: jest.fn(),
    },
    bookingCheckoutSession: {
      count: jest.fn(),
    },
  };

  let service: BookingAvailabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BookingAvailabilityService(db as unknown as DatabaseService);
  });

  it('does not treat unpaid checkout sessions as slot conflicts', async () => {
    db.booking.count.mockResolvedValue(0);

    await expect(
      service.assertAvailable(
        'court-1',
        new Date('2026-07-03T10:00:00Z'),
        new Date('2026-07-03T11:00:00Z')
      )
    ).resolves.toBeUndefined();

    expect(db.booking.count).toHaveBeenCalledWith({
      where: {
        courtId: 'court-1',
        startAt: { lt: new Date('2026-07-03T11:00:00Z') },
        endAt: { gt: new Date('2026-07-03T10:00:00Z') },
        status: 'CONFIRMED',
      },
    });
    expect(db.bookingCheckoutSession.count).not.toHaveBeenCalled();
  });

  it('keeps confirmed bookings as slot conflicts', async () => {
    db.booking.count.mockResolvedValue(1);

    await expect(
      service.assertAvailable(
        'court-1',
        new Date('2026-07-03T10:00:00Z'),
        new Date('2026-07-03T11:00:00Z')
      )
    ).rejects.toThrow(HttpException);
  });
});
