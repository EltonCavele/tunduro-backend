import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  PaymentMethod,
  Prisma,
  WalletTopUpSession,
  WalletTopUpSessionStatus,
  WalletTransactionType,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import {
  extractPaysuitePaymentId,
  mergePaysuiteMetadata,
} from 'src/modules/payment/helpers/paysuite-payment.helper';
import { normalizePaysuiteReference } from 'src/modules/payment/helpers/payment-reference.helper';
import { PaymentProviderFactory } from 'src/modules/payment/providers/payment.provider.factory';
import { ChargeResult } from 'src/modules/payment/providers/payment.provider.interface';
import { PaymentTransactionStateService } from 'src/modules/payment/services/payment-transaction-state.service';

import {
  WalletSelfTopUpRequestDto,
  WalletTopUpRequestDto,
} from '../dtos/request/wallet.request';
import {
  WalletResponseDto,
  WalletTopUpSessionResponseDto,
} from '../dtos/response/wallet.response';
import { mapWalletTopUpSession } from '../helpers/wallet-top-up-session-mapper.helper';

const DEFAULT_CURRENCY = 'MZN';
const DEFAULT_TOP_UP_DEADLINE_MIN = 30;
const WALLET_TOP_UP_NOTE = 'Recarga via PaySuite';

interface WalletDebitArgs {
  userId: string;
  amount: number | Prisma.Decimal;
  bookingId?: string | null;
  paymentReference?: string | null;
  note?: string | null;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly db: DatabaseService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly paymentTransactions: PaymentTransactionStateService
  ) {}

  async getWallet(userId: string): Promise<WalletResponseDto> {
    const wallet = await this.db.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0, currency: DEFAULT_CURRENCY },
      update: {},
    });
    const transactions = await this.db.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return this.mapWallet({ ...wallet, transactions });
  }

  async getAdminWallet(userId: string): Promise<WalletResponseDto> {
    await this.assertUserExists(userId);
    return this.getWallet(userId);
  }

  async topUp(
    adminUserId: string,
    userId: string,
    dto: WalletTopUpRequestDto
  ): Promise<WalletResponseDto> {
    await this.assertUserExists(userId);
    const amount = this.toPositiveDecimal(dto.amount);

    await this.db.$transaction(async tx => {
      await this.createTopUpTransaction(tx, {
        amount,
        createdByUserId: adminUserId,
        note: dto.note?.trim() || null,
        reference: this.reference('TOPUP'),
        userId,
      });
    });

    return this.getWallet(userId);
  }

  async selfTopUp(
    userId: string,
    dto: WalletSelfTopUpRequestDto
  ): Promise<WalletTopUpSessionResponseDto> {
    await this.assertUserExists(userId);

    const amount = this.toPositiveDecimal(dto.amount);
    const reference = this.reference('TOPUP');
    const session = await this.db.walletTopUpSession.create({
      data: {
        amount,
        currency: DEFAULT_CURRENCY,
        expiresAt: new Date(Date.now() + DEFAULT_TOP_UP_DEADLINE_MIN * 60000),
        metadata: { intent: 'wallet_top_up' },
        paymentMethod: PaymentMethod.MPESA,
        phone: dto.phone?.trim() || null,
        reference,
        status: WalletTopUpSessionStatus.OPEN,
        userId,
      },
    });
    const provider = this.paymentProviderFactory.getProvider(
      PaymentMethod.MPESA
    );
    const result = await provider.charge({
      amount: Number(amount),
      currency: DEFAULT_CURRENCY,
      description: `Recarga Tunduro ${reference}`,
      method: PaymentMethod.MPESA,
      reference,
      sessionId: session.id,
      thirdPartyRef: reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 20),
    });

    if (result.status === 'FAILED') {
      await this.failTopUpSession(session, result);
      throw new HttpException(
        result.providerMessage || 'payment.error.declined',
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    const updated = await this.db.walletTopUpSession.update({
      where: { id: session.id },
      data: {
        checkoutUrl: result.checkoutUrl ?? null,
        metadata: mergePaysuiteMetadata(session.metadata, {
          checkoutUrl: result.checkoutUrl,
          paymentId: result.providerPaymentId ?? result.providerTransactionId,
          status: result.providerStatusCode,
          transactionId: result.providerTransactionId,
        }),
        providerMessage: result.providerMessage,
        providerPaymentId: result.providerPaymentId,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId,
      },
    });

    await this.paymentTransactions.markWalletTopUpPending(
      updated,
      PaymentMethod.MPESA,
      result
    );

    if (result.status === 'COMPLETED') {
      await this.completeTopUpSession(updated, result);
      return this.getTopUpSession(userId, session.id);
    }

    return mapWalletTopUpSession(updated);
  }

  async getTopUpSession(
    userId: string,
    sessionId: string
  ): Promise<WalletTopUpSessionResponseDto> {
    const session = await this.findUserTopUpSession(userId, sessionId);

    if (
      session.status === WalletTopUpSessionStatus.OPEN &&
      session.expiresAt.getTime() <= Date.now()
    ) {
      const updated = await this.db.walletTopUpSession.updateMany({
        where: { id: session.id, status: WalletTopUpSessionStatus.OPEN },
        data: { status: WalletTopUpSessionStatus.EXPIRED },
      });
      if (updated.count === 1) {
        await this.paymentTransactions.markWalletTopUpCancelled(
          session,
          session.paymentMethod ?? PaymentMethod.MPESA,
          'session timeout',
          'expired'
        );
      }
      return this.getTopUpSession(userId, session.id);
    }

    return mapWalletTopUpSession(session);
  }

  async refreshTopUpSession(
    userId: string,
    sessionId: string
  ): Promise<WalletTopUpSessionResponseDto> {
    const session = await this.findUserTopUpSession(userId, sessionId);
    if (session.status !== WalletTopUpSessionStatus.OPEN) {
      return mapWalletTopUpSession(session);
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      const updated = await this.db.walletTopUpSession.updateMany({
        where: { id: session.id, status: WalletTopUpSessionStatus.OPEN },
        data: { status: WalletTopUpSessionStatus.EXPIRED },
      });
      if (updated.count === 1) {
        await this.paymentTransactions.markWalletTopUpCancelled(
          session,
          session.paymentMethod ?? PaymentMethod.MPESA,
          'session timeout',
          'expired'
        );
      }
      return this.getTopUpSession(userId, session.id);
    }

    const provider = this.paymentProviderFactory.getProvider(
      session.paymentMethod ?? PaymentMethod.MPESA
    );
    const providerPaymentId =
      session.providerPaymentId ?? extractPaysuitePaymentId(session.metadata);
    if (!provider.getStatus || !providerPaymentId) {
      return mapWalletTopUpSession(session);
    }

    const result = await provider.getStatus({
      providerPaymentId,
      reference: session.reference,
    });

    if (result.status === 'COMPLETED') {
      await this.completeTopUpSession(session, result);
      return this.getTopUpSession(userId, session.id);
    }

    if (result.status === 'FAILED') {
      await this.failTopUpSession(session, result);
      return this.getTopUpSession(userId, session.id);
    }

    const updated = await this.db.walletTopUpSession.update({
      where: { id: session.id },
      data: {
        checkoutUrl: result.checkoutUrl ?? session.checkoutUrl,
        metadata: mergePaysuiteMetadata(session.metadata, {
          checkoutUrl: result.checkoutUrl ?? session.checkoutUrl ?? undefined,
          paymentId: result.providerPaymentId ?? providerPaymentId,
          status: result.providerStatusCode,
          transactionId: result.providerTransactionId,
        }),
        providerMessage: result.providerMessage,
        providerPaymentId: result.providerPaymentId ?? providerPaymentId,
        providerStatusCode: result.providerStatusCode,
        providerTransactionId: result.providerTransactionId,
      },
    });
    await this.paymentTransactions.markWalletTopUpPending(
      updated,
      session.paymentMethod ?? PaymentMethod.MPESA,
      result
    );

    return this.getTopUpSession(userId, session.id);
  }

  async debitBookingBalance(
    tx: Prisma.TransactionClient,
    args: WalletDebitArgs
  ) {
    const amount = this.toPositiveDecimal(args.amount);

    const updated = await tx.wallet.updateMany({
      where: {
        userId: args.userId,
        currency: DEFAULT_CURRENCY,
        balance: { gte: amount },
      },
      data: {
        balance: { decrement: amount },
      },
    });

    if (updated.count !== 1) {
      throw new HttpException(
        'wallet.error.insufficientBalance',
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId: args.userId },
    });

    return tx.walletTransaction.create({
      data: {
        userId: args.userId,
        type: WalletTransactionType.BOOKING_DEBIT,
        amount: amount.mul(-1),
        balanceAfter: wallet.balance,
        currency: wallet.currency,
        reference: this.reference('BOOKING'),
        bookingId: args.bookingId ?? null,
        paymentReference: args.paymentReference ?? null,
        note: args.note?.trim() || null,
      },
    });
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
  }

  private async findUserTopUpSession(
    userId: string,
    sessionId: string
  ): Promise<WalletTopUpSession> {
    const session = await this.db.walletTopUpSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new HttpException(
        'wallet.error.topUpSessionNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    return session;
  }

  private async completeTopUpSession(
    session: WalletTopUpSession,
    result: ChargeResult
  ): Promise<void> {
    await this.db.$transaction(async tx => {
      const updated = await tx.walletTopUpSession.updateMany({
        where: { id: session.id, status: WalletTopUpSessionStatus.OPEN },
        data: {
          checkoutUrl: result.checkoutUrl ?? session.checkoutUrl,
          completedAt: new Date(),
          metadata: mergePaysuiteMetadata(session.metadata, {
            checkoutUrl: result.checkoutUrl ?? session.checkoutUrl ?? undefined,
            paymentId: result.providerPaymentId ?? session.providerPaymentId,
            status: result.providerStatusCode,
            transactionId: result.providerTransactionId,
          }),
          paidAt: new Date(),
          providerMessage: result.providerMessage,
          providerPaymentId: result.providerPaymentId ?? session.providerPaymentId,
          providerStatusCode: result.providerStatusCode,
          providerTransactionId: result.providerTransactionId,
          status: WalletTopUpSessionStatus.COMPLETED,
        },
      });

      if (updated.count !== 1) {
        return;
      }

      await this.createTopUpTransaction(tx, {
        amount: session.amount,
        note: WALLET_TOP_UP_NOTE,
        paymentReference:
          result.providerTransactionId ??
          result.providerPaymentId ??
          session.reference,
        reference: session.reference,
        userId: session.userId,
      });

      await this.paymentTransactions.completeWalletTopUpPayment(
        tx,
        session,
        result
      );
    });
  }

  private async failTopUpSession(
    session: WalletTopUpSession,
    result: ChargeResult
  ): Promise<void> {
    const providerStatusCode = result.providerStatusCode || 'payment.failed';
    const updated = await this.db.walletTopUpSession.updateMany({
      where: { id: session.id, status: WalletTopUpSessionStatus.OPEN },
      data: {
        checkoutUrl: result.checkoutUrl ?? session.checkoutUrl,
        failureReason: `${providerStatusCode}: ${result.providerMessage}`,
        metadata: mergePaysuiteMetadata(session.metadata, {
          checkoutUrl: result.checkoutUrl ?? session.checkoutUrl ?? undefined,
          paymentId: result.providerPaymentId ?? session.providerPaymentId,
          status: providerStatusCode,
          transactionId: result.providerTransactionId,
        }),
        providerMessage: result.providerMessage,
        providerPaymentId: result.providerPaymentId ?? session.providerPaymentId,
        providerStatusCode,
        providerTransactionId: result.providerTransactionId,
        status: WalletTopUpSessionStatus.PAYMENT_FAILED,
      },
    });

    if (updated.count === 1) {
      await this.paymentTransactions.markWalletTopUpFailed(
        session,
        session.paymentMethod ?? PaymentMethod.MPESA,
        result.providerMessage,
        providerStatusCode
      );
    }
  }

  private async createTopUpTransaction(
    tx: Prisma.TransactionClient,
    args: {
      amount: Prisma.Decimal;
      createdByUserId?: string | null;
      note?: string | null;
      paymentReference?: string | null;
      reference: string;
      userId: string;
    }
  ) {
    const wallet = await tx.wallet.upsert({
      where: { userId: args.userId },
      create: {
        userId: args.userId,
        balance: args.amount,
        currency: DEFAULT_CURRENCY,
      },
      update: {
        balance: { increment: args.amount },
      },
    });

    return tx.walletTransaction.create({
      data: {
        userId: args.userId,
        createdByUserId: args.createdByUserId ?? null,
        type: WalletTransactionType.TOP_UP,
        amount: args.amount,
        balanceAfter: wallet.balance,
        currency: wallet.currency,
        reference: args.reference,
        paymentReference: args.paymentReference ?? null,
        note: args.note?.trim() || null,
      },
    });
  }

  private toPositiveDecimal(value: number | Prisma.Decimal): Prisma.Decimal {
    const amount =
      value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);

    if (!amount.isFinite() || amount.lte(0)) {
      throw new HttpException(
        'wallet.error.invalidAmount',
        HttpStatus.BAD_REQUEST
      );
    }

    return amount.toDecimalPlaces(2);
  }

  private reference(prefix: string): string {
    return normalizePaysuiteReference(
      `TUNDUROWALLET${prefix}${randomUUID().slice(0, 8).toUpperCase()}`
    );
  }

  private mapWallet(wallet: any): WalletResponseDto {
    return {
      userId: wallet.userId,
      balance: Number(wallet.balance),
      currency: wallet.currency,
      transactions: (wallet.transactions ?? []).map((transaction: any) => ({
        ...transaction,
        amount: Number(transaction.amount),
        balanceAfter: Number(transaction.balanceAfter),
      })),
    };
  }
}
