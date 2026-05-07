import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { CourtModule } from 'src/modules/court/court.module';
import { LightingModule } from 'src/modules/lighting/lighting.module';

import { BookingPublicController } from './controllers/booking.public.controller';
import { BookingAdminController } from './controllers/booking.admin.controller';
import { BookingService } from './services/booking.service';

@Module({
  imports: [
    DatabaseModule,
    CourtModule,
    LightingModule,
  ],
  controllers: [BookingPublicController, BookingAdminController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
