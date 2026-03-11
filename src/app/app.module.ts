import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { CommonModule } from 'src/common/common.module';
import { BookingModule } from 'src/modules/booking/booking.module';
import { CourtModule } from 'src/modules/court/court.module';
import { LightingModule } from 'src/modules/lighting/lighting.module';
import { UserModule } from 'src/modules/user/user.module';
import { WorkerModule } from 'src/workers/worker.module';

import { HealthController } from './controllers/health.controller';

@Module({
  imports: [
    // Shared Common Services
    CommonModule,

    // Background Processing
    WorkerModule,

    // Health Check
    TerminusModule,

    // Feature Modules
    UserModule,
    CourtModule,
    BookingModule,
    LightingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
