import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingCheckoutSession,
  BookingCheckoutSessionStatus,
  PaymentMethod,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { mergeProviderPaymentMetadata } from '../helpers/zenofy-payment.helper';
import { ChargeResult } from '../providers/payment.provider.interface';
import { BookingCheckoutFinalizerService } from './booking-checkout-finalizer.service';
import { PaymentTransactionStateService } from './payment-transaction-state.service';

interface ZenofyWebhookPayload {
  amount?: number;
  checkout_id?: string;
  currency?: string;
  event?: string;
  paid_at?: string;
  payment_id?: string;
  payment_method?: string;
  reference?: string;
  status?: string;
}

@Injectable()
export class ZenofyWebhookService {
  private readonly logger = new Logger(ZenofyWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly checkoutFinalizer: BookingCheckoutFinalizerService,
    private readonly paymentTransactions: PaymentTransactionStateService,
    private readonly bookingNotifier: BookingNotifierService
  ) {}

  verifySignature(
    rawBody: Buffer | string,
    signature?: string | string[]
  ): boolean {
    const secret =
      this.configService.get<string>('payment.zenofy.webhookSecret')?.trim() ??
      '';
    const received = Array.isArray(signature) ? signature[0] : signature;
    if (!secret || !received) {
      return false;
    }

    const normalizedSignature = received.replace(/^sha256=/i, '').trim();
    const calculated = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const expectedBuffer = Buffer.from(calculated, 'hex');
    const receivedBuffer = Buffer.from(normalizedSignature, 'hex');
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  async handleWebhook(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as ZenofyWebhookPayload;
    const checkoutId = payload.checkout_id?.trim();
    const reference = payload.reference?.trim();
    if (!checkoutId && !reference) {
      this.logger.warn('Zenofy webhook ignored: missing checkout_id/reference');
      return;
    }

    this.logger.log(
      `Zenofy webhook received: ${payload.event ?? 'unknown'} ${
        checkoutId || reference
      }`
    );

    const session = await this.findBookingSession(checkoutId, reference);
    if (!session) {
      this.logger.warn(
        `Zenofy webhook ignored: checkout ${checkoutId || reference} not found`
      );
      return;
    }

    if (payload.event === 'payment.succeeded' || payload.status === 'succeeded') {
      const result = this.successResult(payload);
      const updated = await this.db.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          metadata: mergeProviderPaymentMetadata(
            session.metadata,
            PaymentMethod.CARD,
            {
              event: payload.event,
              orderId: checkoutId,
              paymentId: checkoutId,
              paymentReference: payload.payment_id,
              status: payload.status ?? 'succeeded',
              transactionId: payload.payment_id ?? checkoutId,
            }
          ),
        },
      });

      await this.checkoutFinalizer.completeSuccessfulSession(
        updated,
        PaymentMethod.CARD,
        result
      );
      return;
    }

    if (
      payload.event === 'payment.refunded' ||
      payload.event === 'payment.chargeback' ||
      payload.status === 'refunded' ||
      payload.status === 'chargeback'
    ) {
      await this.cancelSession(
        session,
        payload.status ?? payload.event ?? 'refunded',
        payload
      );
    }
  }

  private async findBookingSession(
    checkoutId: string | undefined,
    reference: string | undefined
  ): Promise<BookingCheckoutSession | null> {
    if (checkoutId) {
      const transaction = await this.db.paymentTransaction.findFirst({
        where: {
          method: PaymentMethod.CARD,
          providerTransactionId: checkoutId,
          checkoutSessionId: { not: null },
        },
        include: { checkoutSession: true },
        orderBy: { createdAt: 'desc' },
      });
      if (transaction?.checkoutSession) {
        return transaction.checkoutSession;
      }

      const session = await this.db.bookingCheckoutSession.findFirst({
        where: {
          paymentMethod: PaymentMethod.CARD,
          metadata: {
            path: ['zenofy', 'paymentId'],
            equals: checkoutId,
          },
        },
      });
      if (session) {
        return session;
      }
    }

    return reference
      ? this.db.bookingCheckoutSession.findUnique({ where: { reference } })
      : null;
  }

  private successResult(payload: ZenofyWebhookPayload): ChargeResult {
    const checkoutId = payload.checkout_id;
    const paymentId = payload.payment_id ?? checkoutId;
    return {
      providerPaymentId: checkoutId,
      providerPayload: payload as Record<string, unknown>,
      providerStatusCode: payload.status ?? 'succeeded',
      providerMessage: 'Zenofy payment confirmed',
      providerTransactionId: paymentId,
      status: 'COMPLETED',
      success: true,
    };
  }

  private async cancelSession(
    session: BookingCheckoutSession,
    providerStatusCode: string,
    payload: ZenofyWebhookPayload
  ): Promise<void> {
    const providerMessage =
      payload.event === 'payment.chargeback'
        ? 'Zenofy payment chargeback'
        : 'Zenofy payment refunded';
    const updated = await this.db.bookingCheckoutSession.updateMany({
      where: {
        id: session.id,
        status: BookingCheckoutSessionStatus.OPEN,
      },
      data: {
        failureReason: `${providerStatusCode}: ${providerMessage}`,
        metadata: mergeProviderPaymentMetadata(
          session.metadata,
          PaymentMethod.CARD,
          {
            event: payload.event,
            orderId: payload.checkout_id,
            paymentId: payload.checkout_id,
            paymentReference: payload.payment_id,
            status: providerStatusCode,
          }
        ),
        status: BookingCheckoutSessionStatus.PAYMENT_FAILED,
      },
    });

    if (updated.count !== 1) {
      return;
    }

    await this.paymentTransactions.markCheckoutCancelled(
      session,
      PaymentMethod.CARD,
      providerMessage,
      providerStatusCode
    );
    await this.bookingNotifier.notifyCheckoutFailed(
      session.id,
      providerMessage
    );
  }
}
