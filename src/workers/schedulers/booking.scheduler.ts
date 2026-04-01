import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BookingService } from 'src/modules/booking/services/booking.service';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';

@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly lightingOrchestratorService: LightingOrchestratorService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleLifecycleTasks() {
    const [
      expiredPayments,
      expiredCheckoutSessions,
      reconciledCheckoutSessions,
      reconciledRefunds,
      noShows,
      completed,
      expiredOffers,
      lightingProcessed,
    ] = await Promise.all([
      this.bookingService.processPendingPaymentExpirations(),
      this.bookingService.processCheckoutSessionExpirations(),
      this.bookingService.reconcilePendingCheckoutSessions(),
      this.bookingService.reconcilePendingRefundTransactions(),
      this.bookingService.processNoShows(),
      this.bookingService.processCompletions(),
      this.bookingService.processWaitlistOfferExpirations(),
      this.lightingOrchestratorService.processAutomaticLighting(),
    ]);

    if (
      expiredPayments ||
      expiredCheckoutSessions ||
      reconciledCheckoutSessions ||
      reconciledRefunds ||
      noShows ||
      completed ||
      expiredOffers ||
      lightingProcessed
    ) {
      this.logger.log(
        `Lifecycle updates -> expiredPayments=${expiredPayments}, expiredCheckoutSessions=${expiredCheckoutSessions}, reconciledCheckoutSessions=${reconciledCheckoutSessions}, reconciledRefunds=${reconciledRefunds}, noShows=${noShows}, completed=${completed}, expiredOffers=${expiredOffers}, lightingProcessed=${lightingProcessed}`
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
    const deleted =
      await this.lightingOrchestratorService.purgeOldAuditLogs(180);
    if (deleted > 0) {
      this.logger.log(`Lighting audit cleanup deleted records: ${deleted}`);
    }
  }
}
