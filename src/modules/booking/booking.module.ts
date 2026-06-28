import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { CourtModule } from 'src/modules/court/court.module';
import { LightingModule } from 'src/modules/lighting/lighting.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { PaymentModule } from 'src/modules/payment/payment.module';
import { WalletModule } from 'src/modules/wallet/wallet.module';

import { BookingPublicController } from './controllers/booking.public.controller';
import { BookingAdminController } from './controllers/booking.admin.controller';
import { BookingAvailabilityService } from './services/booking-availability.service';
import { BookingCheckoutService } from './services/booking-checkout.service';
import { BookingInvitationService } from './services/booking-invitation.service';
import { BookingService } from './services/booking.service';

@Module({
  imports: [
    DatabaseModule,
    CourtModule,
    LightingModule,
    PaymentModule,
    NotificationModule,
    WalletModule,
  ],
  controllers: [BookingPublicController, BookingAdminController],
  providers: [
    BookingService,
    BookingAvailabilityService,
    BookingCheckoutService,
    BookingInvitationService,
  ],
  exports: [BookingService],
})
export class BookingModule {}
