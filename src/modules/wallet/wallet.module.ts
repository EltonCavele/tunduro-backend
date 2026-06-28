import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';

import { WalletAdminController } from './controllers/wallet.admin.controller';
import { WalletPublicController } from './controllers/wallet.public.controller';
import { WalletService } from './services/wallet.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WalletPublicController, WalletAdminController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
