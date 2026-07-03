import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { LightingModule } from 'src/modules/lighting/lighting.module';
import { NotificationModule } from 'src/modules/notification/notification.module';

import { PaymentPublicController } from './controllers/payment.public.controller';
import { PaymentProviderFactory } from './providers/payment.provider.factory';
import { PaysuiteProvider } from './providers/paysuite/paysuite.provider';
import { PaymentProcessor } from './queues/payment.processor';
import { PAYMENT_QUEUE, PaymentQueue } from './queues/payment.queue';
import { BookingCheckoutFinalizerService } from './services/booking-checkout-finalizer.service';
import { PaymentService } from './services/payment.service';
import { PaymentTransactionStateService } from './services/payment-transaction-state.service';
import { PaysuiteWebhookService } from './services/paysuite-webhook.service';

@Module({
  imports: [
    DatabaseModule,
    LightingModule,
    NotificationModule,
    BullModule.registerQueue({ name: PAYMENT_QUEUE }),
  ],
  controllers: [PaymentPublicController],
  providers: [
    PaymentService,
    PaysuiteProvider,
    PaysuiteWebhookService,
    PaymentProviderFactory,
    PaymentQueue,
    PaymentProcessor,
    BookingCheckoutFinalizerService,
    PaymentTransactionStateService,
  ],
  exports: [
    PaymentService,
    PaymentQueue,
    PaymentProviderFactory,
    BookingCheckoutFinalizerService,
    PaymentTransactionStateService,
  ],
})
export class PaymentModule {}
