import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';
import { CourtModule } from 'src/modules/court/court.module';
import { LightingModule } from 'src/modules/lighting/lighting.module';

import { BookingAdminController } from './controllers/booking.admin.controller';
import { BookingPublicController } from './controllers/booking.public.controller';
import { BookingOvertimeService } from './services/booking.overtime.service';
import { BookingService } from './services/booking.service';

@Module({
  imports: [DatabaseModule, HelperModule, CourtModule, LightingModule],
  controllers: [BookingPublicController, BookingAdminController],
  providers: [BookingService, BookingOvertimeService],
  exports: [BookingService, BookingOvertimeService],
})
export class BookingModule {}
