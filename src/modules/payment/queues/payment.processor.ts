import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import {
  BookingStatus,
  PaymentStatus,
  PaymentTransaction,
} from '@prisma/client';
import { Job } from 'bull';

import { DatabaseService } from 'src/common/database/services/database.service';

import { PaymentProviderFactory } from '../providers/payment.provider.factory';
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
    private readonly providerFactory: PaymentProviderFactory
  ) {}

  @Process(PAYMENT_CHARGE_JOB)
  async handleCharge(job: Job<PaymentChargeJobData>): Promise<void> {
    const { paymentId } = job.data;

    const payment = await this.db.paymentTransaction.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });

    if (!payment) {
      this.logger.warn(`Payment ${paymentId} not found, skipping job`);
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.warn(
        `Payment ${paymentId} is not PENDING (got ${payment.status}), skipping job`
      );
      return;
    }

    if (!payment.method) {
      await this.markFailed(payment, 'NO_METHOD', 'payment.error.unsupportedMethod');
      return;
    }

    await this.db.paymentTransaction.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });

    const provider = this.providerFactory.getProvider(payment.method);

    const result = await provider.charge({
      amount: Number(payment.amount),
      currency: payment.currency,
      phone: payment.phone ?? undefined,
      reference: payment.reference,
      thirdPartyRef: payment.id.replace(/-/g, '').slice(0, 20),
    });

    if (result.success) {
      await this.markSucceeded(payment, result.providerTransactionId, result.providerStatusCode, result.providerMessage);
    } else {
      await this.markFailed(
        payment,
        result.providerStatusCode,
        result.providerMessage,
        result.providerTransactionId
      );
    }
  }

  private async markSucceeded(
    payment: PaymentTransaction,
    providerTransactionId: string | undefined,
    providerStatusCode: string,
    providerMessage: string
  ): Promise<void> {
    await this.db.$transaction(async tx => {
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          processedAt: new Date(),
          providerTransactionId: providerTransactionId ?? null,
          providerStatusCode,
          providerMessage,
        },
      });

      const booking = await tx.booking.findUnique({
        where: { id: payment.bookingId },
      });

      if (!booking) return;
      if (booking.status !== BookingStatus.PENDING) return;

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          paidAmount: payment.amount,
          paymentDueAt: null,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: payment.bookingId,
          fromStatus: BookingStatus.PENDING,
          toStatus: BookingStatus.CONFIRMED,
          reason: `payment confirmed via ${payment.method}`,
        },
      });
    });

    this.logger.log(
      `Payment ${payment.id} succeeded (${providerStatusCode}) - booking ${payment.bookingId} CONFIRMED`
    );
  }

  private async markFailed(
    payment: PaymentTransaction,
    providerStatusCode: string,
    providerMessage: string,
    providerTransactionId?: string
  ): Promise<void> {
    await this.db.$transaction(async tx => {
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          processedAt: new Date(),
          providerTransactionId: providerTransactionId ?? null,
          providerStatusCode,
          providerMessage,
        },
      });

      const booking = await tx.booking.findUnique({
        where: { id: payment.bookingId },
      });

      if (!booking) return;
      if (booking.status !== BookingStatus.PENDING) return;

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: `payment failed: ${providerMessage}`,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: payment.bookingId,
          fromStatus: BookingStatus.PENDING,
          toStatus: BookingStatus.CANCELLED,
          reason: `payment failed (${providerStatusCode}): ${providerMessage}`,
        },
      });
    });

    this.logger.warn(
      `Payment ${payment.id} failed (${providerStatusCode}: ${providerMessage}) - booking ${payment.bookingId} CANCELLED`
    );
  }
}
