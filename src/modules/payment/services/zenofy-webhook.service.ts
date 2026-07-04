import { timingSafeEqual } from 'crypto';
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
  currency?: string;
  event?: string;
  orderId?: string;
  paidAt?: string;
  paymentGateway?: string;
  paymentReference?: string | null;
  status?: string;
  totalAmount?: number;
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

  verifySecret(secretHeader?: string | string[]): boolean {
    const secret =
      this.configService.get<string>('payment.zenofy.webhookSecret')?.trim() ??
      '';
    const received = Array.isArray(secretHeader)
      ? secretHeader[0]
      : secretHeader;
    if (!secret || !received) {
      return false;
    }

    const expectedBuffer = Buffer.from(secret);
    const receivedBuffer = Buffer.from(received.trim());
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  async handleWebhook(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as ZenofyWebhookPayload;
    const orderId = payload.orderId?.trim();
    if (!orderId) {
      this.logger.warn('Zenofy webhook ignored: missing orderId');
      return;
    }

    this.logger.log(
      `Zenofy webhook received: ${payload.event ?? 'unknown'} ${orderId}`
    );

    const session = await this.findBookingSession(orderId);
    if (!session) {
      this.logger.warn(`Zenofy webhook ignored: order ${orderId} not found`);
      return;
    }

    if (payload.event === 'order_paid' || payload.status === 'PAID') {
      const result = this.successResult(payload, orderId);
      const updated = await this.db.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          metadata: mergeProviderPaymentMetadata(
            session.metadata,
            PaymentMethod.CARD,
            {
              event: payload.event,
              orderId,
              paymentId: orderId,
              paymentReference: payload.paymentReference,
              status: payload.status ?? 'PAID',
              transactionId: orderId,
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
      payload.event === 'order_cancelled' ||
      payload.event === 'order_refunded' ||
      payload.status === 'CANCELLED' ||
      payload.status === 'REFUNDED'
    ) {
      await this.cancelSession(
        session,
        payload.status ?? payload.event ?? 'CANCELLED',
        payload
      );
    }
  }

  private async findBookingSession(
    orderId: string
  ): Promise<BookingCheckoutSession | null> {
    const transaction = await this.db.paymentTransaction.findFirst({
      where: {
        method: PaymentMethod.CARD,
        providerTransactionId: orderId,
        checkoutSessionId: { not: null },
      },
      include: { checkoutSession: true },
      orderBy: { createdAt: 'desc' },
    });
    if (transaction?.checkoutSession) {
      return transaction.checkoutSession;
    }

    return this.db.bookingCheckoutSession.findFirst({
      where: {
        paymentMethod: PaymentMethod.CARD,
        metadata: {
          path: ['zenofy', 'paymentId'],
          equals: orderId,
        },
      },
    });
  }

  private successResult(
    payload: ZenofyWebhookPayload,
    orderId: string
  ): ChargeResult {
    return {
      providerPaymentId: orderId,
      providerPayload: payload as Record<string, unknown>,
      providerStatusCode: payload.status ?? 'PAID',
      providerMessage: 'Zenofy payment confirmed',
      providerTransactionId: orderId,
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
      payload.event === 'order_refunded'
        ? 'Zenofy order refunded'
        : 'Zenofy order cancelled';
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
            orderId: payload.orderId,
            paymentId: payload.orderId,
            paymentReference: payload.paymentReference,
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
