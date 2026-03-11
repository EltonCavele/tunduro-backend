import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class WebhookScheduler {
  private readonly logger = new Logger(WebhookScheduler.name);

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRetryFailedWebhooks() {
    this.logger.debug('Webhook retry scheduler is disabled in this build.');
  }
}
