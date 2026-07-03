import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';

interface AssertAvailableOptions {
  excludeBookingId?: string;
}

@Injectable()
export class BookingAvailabilityService {
  constructor(private readonly db: DatabaseService) {}

  async assertAvailable(
    courtId: string,
    start: Date,
    end: Date,
    options: AssertAvailableOptions = {}
  ) {
    const blockingOverlap: Prisma.BookingWhereInput = {
      courtId,
      startAt: { lt: end },
      endAt: { gt: start },
      status: BookingStatus.CONFIRMED,
      ...(options.excludeBookingId
        ? { id: { not: options.excludeBookingId } }
        : {}),
    };

    const bookingConflict = await this.db.booking.count({
      where: blockingOverlap,
    });

    if (bookingConflict > 0) {
      throw new HttpException('booking.error.conflict', HttpStatus.CONFLICT);
    }
  }
}
