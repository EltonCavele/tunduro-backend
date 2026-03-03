import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { HelperModule } from 'src/common/helper/helper.module';
import { WebhookModule } from 'src/modules/webhook/webhook.module';

import { MidNightScheduleWorker } from './schedulers/midnight.scheduler';
import { WebhookScheduler } from './schedulers/webhook.scheduler';

@Module({
  imports: [HelperModule, ScheduleModule.forRoot(), WebhookModule],
  providers: [MidNightScheduleWorker, WebhookScheduler],
  exports: [MidNightScheduleWorker],
})
export class WorkerModule {}
