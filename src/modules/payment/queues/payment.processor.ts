import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BookingCheckoutSessionStatus, PaymentMethod } from '@prisma/client';
import { Job } from 'bull';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { mergeProviderPaymentMetadata } from '../helpers/zenofy-payment.helper';
import { PaymentProviderFactory } from '../providers/payment.provider.factory';
import { ChargeResult } from '../providers/payment.provider.interface';
import { BookingCheckoutFinalizerService } from '../services/booking-checkout-finalizer.service';
import { PaymentTransactionStateService } from '../services/payment-transaction-state.service';
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
    private readonly paymentTransactions: PaymentTransactionStateService,
    private readonly bookingNotifier: BookingNotifierService
  ) {}

  @Process(PAYMENT_CHARGE_JOB)
  async handleCharge(job: Job<PaymentChargeJobData>): Promise<void> {
    const { sessionId } = job.data;

    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
      include: {
        organizer: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
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

    const method = session.paymentMethod ?? PaymentMethod.MPESA;
    const provider = this.providerFactory.getProvider(method);
    const customerName = `${session.organizer.firstName ?? ''} ${
      session.organizer.lastName ?? ''
    }`.trim();
    const result = await provider.charge({
      amount: Number(session.amount),
      currency: session.currency,
      customerEmail: session.organizer.email,
      customerName,
      description: `Reserva Tunduro ${session.reference}`,
      method,
      phone:
        method === PaymentMethod.CARD
          ? (session.phone ?? session.organizer.phone ?? undefined)
          : (session.phone ?? undefined),
      reference: session.reference,
      sessionId: session.id,
      thirdPartyRef: session.id.replace(/-/g, '').slice(0, 20),
    });

    if (result.status === 'COMPLETED') {
      const updated = await this.db.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          checkoutUrl: result.checkoutUrl ?? null,
          metadata: mergeProviderPaymentMetadata(session.metadata, method, {
            checkoutUrl: result.checkoutUrl,
            orderId:
              method === PaymentMethod.CARD
                ? (result.providerPaymentId ?? result.providerTransactionId)
                : undefined,
            paymentId: result.providerPaymentId ?? result.providerTransactionId,
            status: result.providerStatusCode,
            transactionId: result.providerTransactionId,
          }),
        },
      });

      await this.paymentTransactions.markCheckoutPending(
        updated,
        method,
        result
      );
      await this.checkoutFinalizer.completeSuccessfulSession(
        updated,
        method,
        result
      );
      return;
    }

    if (result.status === 'PENDING') {
      const updated = await this.db.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          checkoutUrl: result.checkoutUrl ?? null,
          metadata: mergeProviderPaymentMetadata(session.metadata, method, {
            checkoutUrl: result.checkoutUrl,
            orderId:
              method === PaymentMethod.CARD
                ? (result.providerPaymentId ?? result.providerTransactionId)
                : undefined,
            paymentId: result.providerPaymentId ?? result.providerTransactionId,
            status: result.providerStatusCode,
          }),
          status: BookingCheckoutSessionStatus.OPEN,
        },
      });
      await this.paymentTransactions.markCheckoutPending(
        updated,
        method,
        result
      );
      return;
    }

    await this.paymentTransactions.markCheckoutFailed(
      session,
      method,
      result.providerMessage,
      result.providerStatusCode
    );
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
