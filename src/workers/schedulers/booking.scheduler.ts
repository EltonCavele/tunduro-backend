import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BookingService } from 'src/modules/booking/services/booking.service';

@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(private readonly bookingService: BookingService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleLifecycleTasks() {
    this.logger.debug('Running booking lifecycle tasks...');

    const expired = await this.bookingService.expirePendingBookings();
    if (expired > 0) {
      this.logger.log(`Expired ${expired} pending booking(s) (payment timeout).`);
    }
  }
}
