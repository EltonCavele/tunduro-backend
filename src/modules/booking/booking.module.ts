import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';
import { CourtModule } from 'src/modules/court/court.module';
import { LightingModule } from 'src/modules/lighting/lighting.module';

import { BookingPublicController } from './controllers/booking.public.controller';
import { BookingAdminController } from './controllers/booking.admin.controller';
import { PaysuiteClientService } from './services/paysuite.client.service';
import { BookingService } from './services/booking.service';

@Module({
  imports: [
    DatabaseModule,
    HelperModule,
    CourtModule,
    LightingModule,
    HttpModule,
  ],
  controllers: [BookingPublicController, BookingAdminController],
  providers: [BookingService, PaysuiteClientService],
  exports: [BookingService],
})
export class BookingModule {}
