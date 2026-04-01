import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';

import { PaymentPublicController } from './controllers/payment.public.controller';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentPublicController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
