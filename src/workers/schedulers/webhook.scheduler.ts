import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { WebhookService } from 'src/modules/webhook/services/webhook.service';

@Injectable()
export class WebhookScheduler {
  private readonly logger = new Logger(WebhookScheduler.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRetryFailedWebhooks() {
    this.logger.debug('Processing failed webhook retries');
    await this.webhookService.retryFailed();
  }
}
