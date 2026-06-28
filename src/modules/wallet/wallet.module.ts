import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { PaymentModule } from 'src/modules/payment/payment.module';

import { WalletAdminController } from './controllers/wallet.admin.controller';
import { WalletPublicController } from './controllers/wallet.public.controller';
import { WalletService } from './services/wallet.service';

@Module({
  imports: [DatabaseModule, PaymentModule],
  controllers: [WalletPublicController, WalletAdminController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
