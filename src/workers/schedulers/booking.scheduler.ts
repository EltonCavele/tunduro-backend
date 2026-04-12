import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BookingService } from 'src/modules/booking/services/booking.service';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';

@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly lightingOrchestratorService: LightingOrchestratorService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleLifecycleTasks() {
    this.logger.debug('Running booking lifecycle tasks...');
    
    // Process automatic lighting
    const lightsProcessed = await this.lightingOrchestratorService.processAutomaticLighting();
    
    if (lightsProcessed > 0) {
      this.logger.log(`Automatic lighting: ${lightsProcessed} devices processed.`);
    }
  }
}
