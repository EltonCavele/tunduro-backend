import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';

export const PAYMENT_QUEUE = 'payment';
export const PAYMENT_CHARGE_JOB = 'charge';

export interface PaymentChargeJobData {
  sessionId: string;
}

@Injectable()
export class PaymentQueue {
  constructor(
    @InjectQueue(PAYMENT_QUEUE) private readonly queue: Queue<PaymentChargeJobData>
  ) {}

  async enqueueCharge(sessionId: string): Promise<void> {
    await this.queue.add(
      PAYMENT_CHARGE_JOB,
      { sessionId },
      {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  }
}
