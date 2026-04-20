import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';

import { ReportsAdminController } from './controllers/reports.admin.controller';
import { ReportsService } from './services/reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ReportsAdminController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}