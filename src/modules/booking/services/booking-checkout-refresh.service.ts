import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  BookingCheckoutSession,
  BookingCheckoutSessionStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import {
  extractProviderPaymentId,
  mergeProviderPaymentMetadata,
} from 'src/modules/payment/helpers/zenofy-payment.helper';
import { PaymentProviderFactory } from 'src/modules/payment/providers/payment.provider.factory';
import { BookingCheckoutFinalizerService } from 'src/modules/payment/services/booking-checkout-finalizer.service';
import { PaymentTransactionStateService } from 'src/modules/payment/services/payment-transaction-state.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { BOOKING_EXTENSION_INTENT } from '../constants/booking-extension.constants';
import { BookingCheckoutSessionResponseDto } from '../dtos/response/booking.checkout.response';
import { mapCheckoutSession } from '../helpers/booking-mapper.helper';

@Injectable()
export class BookingCheckoutRefreshService {
  constructor(
    private readonly db: DatabaseService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly checkoutFinalizer: BookingCheckoutFinalizerService,
    private readonly paymentTransactions: PaymentTransactionStateService,
    private readonly bookingNotifier: BookingNotifierService
  ) {}

  async refreshCheckoutSession(
    user: IAuthUser,
    sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new HttpException(
        'booking.error.checkoutSessionNotFound',
        HttpStatus.NOT_FOUND
      );
    }
    if (!this.canAccessCheckoutSession(user, session)) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    return this.refreshSession(session);
  }

  private async refreshSession(
    session: BookingCheckoutSession
  ): Promise<BookingCheckoutSessionResponseDto> {
    if (session.status !== BookingCheckoutSessionStatus.OPEN) {
      return mapCheckoutSession(session);
    }

    const method = session.paymentMethod ?? PaymentMethod.MPESA;
    const provider = this.providerFactory.getProvider(method);
    const providerPaymentId = extractProviderPaymentId(
      session.metadata,
      method
    );
    if (!provider.getStatus || !providerPaymentId) {
      return mapCheckoutSession(session);
    }

    const result = await provider.getStatus({
      providerPaymentId,
      reference: session.reference,
    });

    if (result.status === 'COMPLETED') {
      const updated = await this.db.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          checkoutUrl: result.checkoutUrl ?? session.checkoutUrl,
          metadata: mergeProviderPaymentMetadata(session.metadata, method, {
            checkoutUrl: result.checkoutUrl ?? session.checkoutUrl ?? undefined,
            orderId:
              method === PaymentMethod.CARD
                ? (result.providerPaymentId ?? providerPaymentId)
                : undefined,
            paymentId: result.providerPaymentId ?? providerPaymentId,
            status: result.providerStatusCode,
            transactionId: result.providerTransactionId,
          }),
        },
      });
      await this.checkoutFinalizer.completeSuccessfulSession(
        updated,
        method,
        result
      );
      return this.findAndMap(session.id);
    }

    if (result.status === 'FAILED') {
      const remoteStatus = result.providerStatusCode.toLowerCase();
      const isPaymentFailure = [
        'failed',
        'cancelled',
        'canceled',
        'chargeback',
        'declined',
        'expired',
        'payment.failed',
        'rejected',
        'refunded',
      ].includes(remoteStatus);
      if (!isPaymentFailure) {
        throw new HttpException(
          result.providerMessage || 'payment.error.gatewayUnavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      await this.failSession(
        session,
        method,
        result.providerMessage,
        result.providerStatusCode
      );
      const isCancellation = [
        'cancelled',
        'canceled',
        'chargeback',
        'expired',
        'refunded',
      ].includes(remoteStatus);
      if (isCancellation) {
        await this.paymentTransactions.markCheckoutCancelled(
          session,
          method,
          result.providerMessage,
          result.providerStatusCode
        );
      } else {
        await this.paymentTransactions.markCheckoutFailed(
          session,
          method,
          result.providerMessage,
          result.providerStatusCode
        );
      }
      return this.findAndMap(session.id);
    }

    const updated = await this.db.bookingCheckoutSession.update({
      where: { id: session.id },
      data: {
        checkoutUrl: result.checkoutUrl ?? session.checkoutUrl,
        metadata: mergeProviderPaymentMetadata(session.metadata, method, {
          checkoutUrl: result.checkoutUrl ?? session.checkoutUrl ?? undefined,
          orderId:
            method === PaymentMethod.CARD
              ? (result.providerPaymentId ?? providerPaymentId)
              : undefined,
          paymentId: result.providerPaymentId ?? providerPaymentId,
          status: result.providerStatusCode,
        }),
      },
    });
    await this.paymentTransactions.markCheckoutPending(
      updated,
      method,
      result
    );

    return this.findAndMap(session.id);
  }

  private async failSession(
    session: BookingCheckoutSession,
    method: PaymentMethod,
    providerMessage: string,
    providerStatusCode: string
  ): Promise<void> {
    const failureReason = `${providerStatusCode}: ${providerMessage}`;
    const updated = await this.db.bookingCheckoutSession.updateMany({
      where: {
        id: session.id,
        status: BookingCheckoutSessionStatus.OPEN,
      },
      data: {
        failureReason,
        metadata: mergeProviderPaymentMetadata(session.metadata, method, {
          orderId:
            method === PaymentMethod.CARD
              ? (extractProviderPaymentId(session.metadata, method) ?? undefined)
              : undefined,
          paymentId: extractProviderPaymentId(session.metadata, method) ?? undefined,
          status: providerStatusCode,
        }),
        status: BookingCheckoutSessionStatus.PAYMENT_FAILED,
      },
    });

    if (updated.count === 1) {
      await this.bookingNotifier.notifyCheckoutFailed(
        session.id,
        providerMessage
      );
    }
  }

  private async findAndMap(
    sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    const session = await this.db.bookingCheckoutSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    return mapCheckoutSession(session);
  }

  private canAccessCheckoutSession(
    user: IAuthUser,
    session: {
      organizerId: string;
      metadata: Prisma.JsonValue;
    }
  ): boolean {
    if (session.organizerId === user.userId || user.role === 'ADMIN') {
      return true;
    }

    const metadata = session.metadata as Record<string, unknown> | null;
    return (
      metadata?.intent === BOOKING_EXTENSION_INTENT &&
      metadata?.requestedByUserId === user.userId
    );
  }
}
