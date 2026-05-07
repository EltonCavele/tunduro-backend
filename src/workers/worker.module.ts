import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { HelperModule } from 'src/common/helper/helper.module';
import { BookingModule } from 'src/modules/booking/booking.module';

import { BookingScheduler } from './schedulers/booking.scheduler';
import { MidNightScheduleWorker } from './schedulers/midnight.scheduler';

@Module({
  imports: [HelperModule, BookingModule, ScheduleModule.forRoot()],
  providers: [MidNightScheduleWorker, BookingScheduler],
  exports: [MidNightScheduleWorker],
})
export class WorkerModule {}
