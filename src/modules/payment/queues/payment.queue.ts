import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';

export const PAYMENT_QUEUE = 'payment';
export const PAYMENT_CHARGE_JOB = 'charge';

// If Redis is unreachable, Bull's `queue.add` waits for a connection instead of
// throwing, which hangs the HTTP request forever. Cap it so the caller fails
// fast (the checkout flow then surfaces "gateway unavailable" cleanly).
const ENQUEUE_TIMEOUT_MS = 5000;

export interface PaymentChargeJobData {
  sessionId: string;
}

@Injectable()
export class PaymentQueue {
  private readonly logger = new Logger(PaymentQueue.name);

  constructor(
    @InjectQueue(PAYMENT_QUEUE) private readonly queue: Queue<PaymentChargeJobData>
  ) {}

  async enqueueCharge(sessionId: string): Promise<void> {
    await this.withTimeout(
      this.queue.add(
        PAYMENT_CHARGE_JOB,
        { sessionId },
        {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: false,
        }
      ),
      ENQUEUE_TIMEOUT_MS,
      `Timed out enqueuing charge for session ${sessionId} (is Redis running?)`
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.logger.error(message);
        reject(new Error(message));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
