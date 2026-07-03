import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingCheckoutSession,
  BookingCheckoutSessionStatus,
  PaymentMethod,
  WalletTopUpSession,
  WalletTopUpSessionStatus,
  WalletTransactionType,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { mergePaysuiteMetadata } from '../helpers/paysuite-payment.helper';
import { ChargeResult } from '../providers/payment.provider.interface';
import { BookingCheckoutFinalizerService } from './booking-checkout-finalizer.service';
import { PaymentTransactionStateService } from './payment-transaction-state.service';

interface PaysuiteWebhookPayload {
  data?: {
    error?: string;
    id?: number | string;
    reference?: string;
    status?: string;
    transaction?: {
      id?: number | string;
      method?: string;
      paid_at?: string;
      status?: string;
      transaction_id?: number | string;
    };
  };
  event?: string;
  request_id?: string;
}

@Injectable()
export class PaysuiteWebhookService {
  private readonly logger = new Logger(PaysuiteWebhookService.name);

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
      this.configService
        .get<string>('payment.paysuite.webhookSecret')
        ?.trim() ?? '';
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
    const payload = rawPayload as PaysuiteWebhookPayload;
    const reference = payload.data?.reference?.trim() ?? '';
    const paymentId = payload.data?.id ? String(payload.data.id) : undefined;
    if (!reference && !paymentId) {
      this.logger.warn('PaySuite webhook ignored: missing reference and id');
      return;
    }

    this.logger.log(
      `PaySuite webhook received: ${payload.event ?? 'unknown'} ${
        reference || paymentId
      }`
    );

    const session =
      (reference
        ? await this.db.bookingCheckoutSession.findUnique({
            where: { reference },
          })
        : null) ??
      (paymentId
        ? await this.db.bookingCheckoutSession.findFirst({
            where: {
              metadata: {
                path: ['paysuite', 'paymentId'],
                equals: paymentId,
              },
            },
          })
        : null);
    if (!session) {
      const topUpSession =
        (reference
          ? await this.db.walletTopUpSession.findUnique({
              where: { reference },
            })
          : null) ??
        (paymentId
          ? await this.db.walletTopUpSession.findFirst({
              where: {
                metadata: {
                  path: ['paysuite', 'paymentId'],
                  equals: paymentId,
                },
              },
            })
          : null);
      if (!topUpSession) {
        this.logger.warn(
          `PaySuite webhook ignored: session ${reference || paymentId} not found`
        );
        return;
      }

      if (payload.event === 'payment.success') {
        await this.completeWalletTopUpSession(topUpSession, payload);
        return;
      }

      if (payload.event === 'payment.failed') {
        await this.failWalletTopUpSession(
          topUpSession,
          payload.data?.error ?? 'payment.error.declined',
          payload
        );
      }
      return;
    }

    if (payload.event === 'payment.success') {
      const result = this.successResult(payload);
      const updated = await this.db.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          metadata: mergePaysuiteMetadata(session.metadata, {
            event: payload.event,
            paymentId: payload.data?.id ? String(payload.data.id) : undefined,
            requestId: payload.request_id,
            status: payload.data?.status ?? 'paid',
            transactionId: result.providerTransactionId,
          }),
        },
      });

      await this.checkoutFinalizer.completeSuccessfulSession(
        updated,
        session.paymentMethod ?? PaymentMethod.MPESA,
        result
      );
      return;
    }

    if (payload.event === 'payment.failed') {
      await this.failSession(
        session,
        payload.data?.error ?? 'payment.error.declined',
        payload
      );
    }
  }

  private successResult(payload: PaysuiteWebhookPayload): ChargeResult {
    const transaction = payload.data?.transaction;
    const transactionId =
      transaction?.transaction_id ?? transaction?.id ?? payload.data?.id;

    return {
      providerPaymentId: payload.data?.id ? String(payload.data.id) : undefined,
      providerPayload: payload as Record<string, unknown>,
      providerStatusCode: payload.data?.status ?? 'paid',
      providerMessage: 'PaySuite payment confirmed',
      providerTransactionId: transactionId ? String(transactionId) : undefined,
      status: 'COMPLETED',
      success: true,
    };
  }

  private async failSession(
    session: BookingCheckoutSession,
    providerMessage: string,
    payload: PaysuiteWebhookPayload
  ): Promise<void> {
    const providerStatusCode = payload.data?.status ?? 'payment.failed';
    const failureReason = `${providerStatusCode}: ${providerMessage}`;
    const updated = await this.db.bookingCheckoutSession.updateMany({
      where: {
        id: session.id,
        status: { in: [BookingCheckoutSessionStatus.OPEN] },
      },
      data: {
        failureReason,
        metadata: mergePaysuiteMetadata(session.metadata, {
          event: payload.event,
          paymentId: payload.data?.id ? String(payload.data.id) : undefined,
          requestId: payload.request_id,
          status: providerStatusCode,
        }),
        status: BookingCheckoutSessionStatus.PAYMENT_FAILED,
      },
    });

    if (updated.count === 1) {
      await this.paymentTransactions.markCheckoutFailed(
        session,
        session.paymentMethod ?? PaymentMethod.MPESA,
        providerMessage,
        providerStatusCode
      );
      await this.bookingNotifier.notifyCheckoutFailed(
        session.id,
        providerMessage
      );
    }
  }

  private async completeWalletTopUpSession(
    session: WalletTopUpSession,
    payload: PaysuiteWebhookPayload
  ): Promise<void> {
    const result = this.successResult(payload);

    await this.db.$transaction(async tx => {
      const updated = await tx.walletTopUpSession.updateMany({
        where: { id: session.id, status: WalletTopUpSessionStatus.OPEN },
        data: {
          completedAt: new Date(),
          metadata: mergePaysuiteMetadata(session.metadata, {
            checkoutUrl: session.checkoutUrl ?? undefined,
            event: payload.event,
            paymentId: result.providerPaymentId ?? session.providerPaymentId,
            requestId: payload.request_id,
            status: payload.data?.status ?? 'paid',
            transactionId: result.providerTransactionId,
          }),
          paidAt: new Date(),
          providerMessage: result.providerMessage,
          providerPaymentId: result.providerPaymentId ?? session.providerPaymentId,
          providerStatusCode: payload.data?.status ?? 'paid',
          providerTransactionId: result.providerTransactionId,
          status: WalletTopUpSessionStatus.COMPLETED,
        },
      });

      if (updated.count !== 1) {
        return;
      }

      const wallet = await tx.wallet.upsert({
        where: { userId: session.userId },
        create: {
          balance: session.amount,
          currency: session.currency,
          userId: session.userId,
        },
        update: {
          balance: { increment: session.amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          amount: session.amount,
          balanceAfter: wallet.balance,
          currency: wallet.currency,
          note: 'Recarga via PaySuite',
          paymentReference:
            result.providerTransactionId ??
            result.providerPaymentId ??
            session.reference,
          reference: session.reference,
          type: WalletTransactionType.TOP_UP,
          userId: session.userId,
        },
      });

      await this.paymentTransactions.completeWalletTopUpPayment(
        tx,
        session,
        result
      );
    });
  }

  private async failWalletTopUpSession(
    session: WalletTopUpSession,
    providerMessage: string,
    payload: PaysuiteWebhookPayload
  ): Promise<void> {
    const providerStatusCode = payload.data?.status ?? 'payment.failed';
    const updated = await this.db.walletTopUpSession.updateMany({
      where: { id: session.id, status: WalletTopUpSessionStatus.OPEN },
      data: {
        failureReason: `${providerStatusCode}: ${providerMessage}`,
        metadata: mergePaysuiteMetadata(session.metadata, {
          checkoutUrl: session.checkoutUrl ?? undefined,
          event: payload.event,
          paymentId: payload.data?.id
            ? String(payload.data.id)
            : (session.providerPaymentId ?? undefined),
          requestId: payload.request_id,
          status: providerStatusCode,
        }),
        providerMessage,
        providerPaymentId: payload.data?.id
          ? String(payload.data.id)
          : session.providerPaymentId,
        providerStatusCode,
        status: WalletTopUpSessionStatus.PAYMENT_FAILED,
      },
    });

    if (updated.count === 1) {
      await this.paymentTransactions.markWalletTopUpFailed(
        session,
        session.paymentMethod ?? PaymentMethod.MPESA,
        providerMessage,
        providerStatusCode
      );
    }
  }
}
