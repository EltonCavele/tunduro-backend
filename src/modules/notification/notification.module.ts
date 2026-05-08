import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';

import { BookingNotifierService } from './services/booking.notifier.service';

@Module({
  imports: [DatabaseModule, HelperModule],
  providers: [BookingNotifierService],
  exports: [BookingNotifierService],
})
export class NotificationModule {}
