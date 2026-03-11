import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';

import { CourtAdminController } from './controllers/court.admin.controller';
import { CourtPublicController } from './controllers/court.public.controller';
import { CourtService } from './services/court.service';

@Module({
  imports: [DatabaseModule, HelperModule],
  controllers: [CourtPublicController, CourtAdminController],
  providers: [CourtService],
  exports: [CourtService],
})
export class CourtModule {}
