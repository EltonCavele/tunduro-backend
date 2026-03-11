import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BookingOvertimeService } from 'src/modules/booking/services/booking.overtime.service';
import { BookingService } from 'src/modules/booking/services/booking.service';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';

@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly bookingOvertimeService: BookingOvertimeService,
    private readonly lightingOrchestratorService: LightingOrchestratorService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleLifecycleTasks() {
    const [
      expiredPayments,
      noShows,
      completed,
      expiredOffers,
      expiredOvertimePayments,
      lightingProcessed,
    ] =
      await Promise.all([
        this.bookingService.processPendingPaymentExpirations(),
        this.bookingService.processNoShows(),
        this.bookingService.processCompletions(),
        this.bookingService.processWaitlistOfferExpirations(),
        this.bookingOvertimeService.processPaymentExpirations(),
        this.lightingOrchestratorService.processAutomaticLighting(),
      ]);

    if (
      expiredPayments ||
      noShows ||
      completed ||
      expiredOffers ||
      expiredOvertimePayments ||
      lightingProcessed
    ) {
      this.logger.log(
        `Lifecycle updates -> expiredPayments=${expiredPayments}, noShows=${noShows}, completed=${completed}, expiredOffers=${expiredOffers}, expiredOvertimePayments=${expiredOvertimePayments}, lightingProcessed=${lightingProcessed}`
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleDeviceStatusSync() {
    const synced = await this.lightingOrchestratorService.syncDeviceStatuses();
    if (synced > 0) {
      this.logger.log(`Lighting device status synced: ${synced}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleLightingAuditRetention() {
    const deleted = await this.lightingOrchestratorService.purgeOldAuditLogs(180);
    if (deleted > 0) {
      this.logger.log(`Lighting audit cleanup deleted records: ${deleted}`);
    }
  }
}
