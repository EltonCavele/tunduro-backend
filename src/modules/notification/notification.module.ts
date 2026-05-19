import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';

import { NotificationPublicController } from './controllers/notification.public.controller';
import { BookingNotifierService } from './services/booking.notifier.service';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [DatabaseModule, HelperModule],
  controllers: [NotificationPublicController],
  providers: [BookingNotifierService, NotificationService],
  exports: [BookingNotifierService, NotificationService],
})
export class NotificationModule {}
