import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { NotificationModule } from 'src/modules/notification/notification.module';

import { PaymentPublicController } from './controllers/payment.public.controller';
import { MpesaProvider } from './providers/mpesa/mpesa.provider';
import { PaymentProviderFactory } from './providers/payment.provider.factory';
import { PaymentProcessor } from './queues/payment.processor';
import { PAYMENT_QUEUE, PaymentQueue } from './queues/payment.queue';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [
    DatabaseModule,
    NotificationModule,
    BullModule.registerQueue({ name: PAYMENT_QUEUE }),
  ],
  controllers: [PaymentPublicController],
  providers: [
    PaymentService,
    MpesaProvider,
    PaymentProviderFactory,
    PaymentQueue,
    PaymentProcessor,
  ],
  exports: [PaymentService, PaymentQueue, PaymentProviderFactory],
})
export class PaymentModule {}
