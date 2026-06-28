import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import {
  BookingCheckoutSessionStatus,
  PaymentMethod,
} from '@prisma/client';
import { Job } from 'bull';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { PaymentProviderFactory } from '../providers/payment.provider.factory';
import { ChargeResult } from '../providers/payment.provider.interface';
import { BookingCheckoutFinalizerService } from '../services/booking-checkout-finalizer.service';
import {
  PAYMENT_CHARGE_JOB,
  PAYMENT_QUEUE,
  PaymentChargeJobData,
} from './payment.queue';

@Processor(PAYMENT_QUEUE)
export class PaymentProcessor {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly checkoutFinalizer: BookingCheckoutFinalizerService,
    private readonly bookingNotifier: BookingNotifierService
  ) {}

  @Process(PAYMENT_CHARGE_JOB)
  async handleCharge(job: Job<PaymentChargeJobData>): Promise<void> {
    const { sessionId } = job.data;

    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      this.logger.warn(`Checkout session ${sessionId} not found, skipping job`);
      return;
    }

    if (session.status !== BookingCheckoutSessionStatus.OPEN) {
      this.logger.warn(
        `Session ${sessionId} is not OPEN (got ${session.status}), skipping job`
      );
      return;
    }

    await this.db.bookingCheckoutSession.update({
      where: { id: sessionId },
      data: { status: BookingCheckoutSessionStatus.FINALIZING },
    });

    const method = session.paymentMethod ?? PaymentMethod.MPESA;
    const provider = this.providerFactory.getProvider(method);
    const result = await provider.charge({
      amount: Number(session.amount),
      currency: session.currency,
      phone: session.phone ?? undefined,
      reference: session.reference,
      thirdPartyRef: session.id.replace(/-/g, '').slice(0, 20),
    });

    if (result.success) {
      await this.checkoutFinalizer.completeSuccessfulSession(
        session,
        method,
        result
      );
      return;
    }

    await this.failSession(session.id, result);
  }

  private async failSession(
    sessionId: string,
    result: ChargeResult
  ): Promise<void> {
    const failureReason = `${result.providerStatusCode}: ${result.providerMessage}`;

    await this.db.bookingCheckoutSession.update({
      where: { id: sessionId },
      data: {
        status: BookingCheckoutSessionStatus.PAYMENT_FAILED,
        failureReason,
      },
    });

    this.logger.warn(`Session ${sessionId} payment failed (${failureReason})`);
    await this.bookingNotifier.notifyCheckoutFailed(
      sessionId,
      result.providerMessage
    );
  }
}
