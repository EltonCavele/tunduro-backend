import { Injectable } from '@nestjs/common';
import {
  BookingCheckoutSession,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
  WalletTopUpSession,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BOOKING_EXTENSION_INTENT } from 'src/modules/booking/constants/booking-extension.constants';

import { mergePaysuiteMetadata } from '../helpers/paysuite-payment.helper';
import { ChargeResult } from '../providers/payment.provider.interface';

@Injectable()
export class PaymentTransactionStateService {
  constructor(private readonly db: DatabaseService) {}

  async markCheckoutPending(
    session: BookingCheckoutSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<void> {
    const metadata = mergePaysuiteMetadata(session.metadata, {
      checkoutUrl: result.checkoutUrl,
      paymentId: result.providerPaymentId ?? result.providerTransactionId,
      status: result.providerStatusCode,
      transactionId: result.providerTransactionId,
    });

    await this.db.paymentTransaction.upsert({
      where: { checkoutSessionId: session.id },
      create: {
        amount: session.amount,
        bookingId: session.bookingId,
        checkoutSessionId: session.id,
        currency: session.currency,
        attempts: 1,
        metadata,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        reference: session.reference,
        status: PaymentStatus.PENDING,
        type: this.getCheckoutPaymentType(session),
        userId: session.organizerId,
      },
      update: {
        amount: session.amount,
        currency: session.currency,
        attempts: { increment: 1 },
        metadata,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        status: PaymentStatus.PENDING,
      },
    });
  }

  async markCheckoutFailed(
    session: BookingCheckoutSession,
    method: PaymentMethod,
    providerMessage: string,
    providerStatusCode: string
  ): Promise<void> {
    await this.db.paymentTransaction.upsert({
      where: { checkoutSessionId: session.id },
      create: {
        amount: session.amount,
        bookingId: session.bookingId,
        checkoutSessionId: session.id,
        currency: session.currency,
        attempts: 1,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage,
        providerStatusCode,
        reference: session.reference,
        status: PaymentStatus.FAILED,
        processedAt: new Date(),
        type: this.getCheckoutPaymentType(session),
        userId: session.organizerId,
      },
      update: {
        providerMessage,
        providerStatusCode,
        status: PaymentStatus.FAILED,
        processedAt: new Date(),
      },
    });
  }

  async markCheckoutCancelled(
    session: BookingCheckoutSession,
    method: PaymentMethod,
    providerMessage: string,
    providerStatusCode: string
  ): Promise<void> {
    await this.db.paymentTransaction.upsert({
      where: { checkoutSessionId: session.id },
      create: {
        amount: session.amount,
        bookingId: session.bookingId,
        checkoutSessionId: session.id,
        currency: session.currency,
        attempts: 1,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage,
        providerStatusCode,
        reference: session.reference,
        status: PaymentStatus.CANCELLED,
        processedAt: new Date(),
        type: this.getCheckoutPaymentType(session),
        userId: session.organizerId,
      },
      update: {
        providerMessage,
        providerStatusCode,
        status: PaymentStatus.CANCELLED,
        processedAt: new Date(),
      },
    });
  }

  async completeCheckoutPayment(
    tx: Prisma.TransactionClient,
    session: BookingCheckoutSession,
    bookingId: string,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<void> {
    const updated = await tx.paymentTransaction.updateMany({
      where: { checkoutSessionId: session.id },
      data: {
        bookingId,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        processedAt: new Date(),
        status: PaymentStatus.COMPLETED,
      },
    });

    if (updated.count > 0) {
      return;
    }

    await tx.paymentTransaction.create({
      data: {
        amount: session.amount,
        bookingId,
        checkoutSessionId: session.id,
        currency: session.currency,
        attempts: 1,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        processedAt: new Date(),
        reference: session.reference,
        status: PaymentStatus.COMPLETED,
        type: this.getCheckoutPaymentType(session),
        userId: session.organizerId,
      },
    });
  }

  async completeCheckoutWithoutBooking(
    tx: Prisma.TransactionClient,
    session: BookingCheckoutSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<void> {
    const updated = await tx.paymentTransaction.updateMany({
      where: { checkoutSessionId: session.id },
      data: {
        bookingId: null,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        processedAt: new Date(),
        status: PaymentStatus.COMPLETED,
      },
    });

    if (updated.count > 0) {
      return;
    }

    await tx.paymentTransaction.create({
      data: {
        amount: session.amount,
        bookingId: null,
        checkoutSessionId: session.id,
        currency: session.currency,
        attempts: 1,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        processedAt: new Date(),
        reference: session.reference,
        status: PaymentStatus.COMPLETED,
        type: this.getCheckoutPaymentType(session),
        userId: session.organizerId,
      },
    });
  }

  async markWalletTopUpPending(
    session: WalletTopUpSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<void> {
    const metadata = mergePaysuiteMetadata(session.metadata, {
      checkoutUrl: result.checkoutUrl,
      paymentId: result.providerPaymentId ?? result.providerTransactionId,
      status: result.providerStatusCode,
      transactionId: result.providerTransactionId,
    });

    await this.db.paymentTransaction.upsert({
      where: { walletTopUpSessionId: session.id },
      create: {
        amount: session.amount,
        currency: session.currency,
        attempts: 1,
        metadata,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        reference: session.reference,
        status: PaymentStatus.PENDING,
        type: PaymentType.WALLET_TOP_UP,
        userId: session.userId,
        walletTopUpSessionId: session.id,
      },
      update: {
        amount: session.amount,
        currency: session.currency,
        attempts: { increment: 1 },
        metadata,
        method,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        status: PaymentStatus.PENDING,
      },
    });
  }

  async markWalletTopUpFailed(
    session: WalletTopUpSession,
    method: PaymentMethod,
    providerMessage: string,
    providerStatusCode: string
  ): Promise<void> {
    await this.db.paymentTransaction.upsert({
      where: { walletTopUpSessionId: session.id },
      create: {
        amount: session.amount,
        currency: session.currency,
        attempts: 1,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage,
        providerStatusCode,
        reference: session.reference,
        status: PaymentStatus.FAILED,
        processedAt: new Date(),
        type: PaymentType.WALLET_TOP_UP,
        userId: session.userId,
        walletTopUpSessionId: session.id,
      },
      update: {
        providerMessage,
        providerStatusCode,
        status: PaymentStatus.FAILED,
        processedAt: new Date(),
      },
    });
  }

  async markWalletTopUpCancelled(
    session: WalletTopUpSession,
    method: PaymentMethod,
    providerMessage: string,
    providerStatusCode: string
  ): Promise<void> {
    await this.db.paymentTransaction.upsert({
      where: { walletTopUpSessionId: session.id },
      create: {
        amount: session.amount,
        currency: session.currency,
        attempts: 1,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method,
        phone: session.phone,
        providerMessage,
        providerStatusCode,
        reference: session.reference,
        status: PaymentStatus.CANCELLED,
        processedAt: new Date(),
        type: PaymentType.WALLET_TOP_UP,
        userId: session.userId,
        walletTopUpSessionId: session.id,
      },
      update: {
        providerMessage,
        providerStatusCode,
        status: PaymentStatus.CANCELLED,
        processedAt: new Date(),
      },
    });
  }

  async completeWalletTopUpPayment(
    tx: Prisma.TransactionClient,
    session: WalletTopUpSession,
    result: ChargeResult
  ): Promise<void> {
    const updated = await tx.paymentTransaction.updateMany({
      where: { walletTopUpSessionId: session.id },
      data: {
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        processedAt: new Date(),
        status: PaymentStatus.COMPLETED,
      },
    });

    if (updated.count > 0) {
      return;
    }

    await tx.paymentTransaction.create({
      data: {
        amount: session.amount,
        currency: session.currency,
        attempts: 1,
        metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        method: session.paymentMethod ?? PaymentMethod.MPESA,
        phone: session.phone,
        providerMessage: result.providerMessage,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId ?? null,
        processedAt: new Date(),
        reference: session.reference,
        status: PaymentStatus.COMPLETED,
        type: PaymentType.WALLET_TOP_UP,
        userId: session.userId,
        walletTopUpSessionId: session.id,
      },
    });
  }

  private getCheckoutPaymentType(
    session: BookingCheckoutSession
  ): PaymentType {
    const metadata = session.metadata as Record<string, unknown> | null;
    return metadata?.intent === BOOKING_EXTENSION_INTENT
      ? PaymentType.OVERTIME_ADJUSTMENT
      : PaymentType.BOOKING;
  }
}
