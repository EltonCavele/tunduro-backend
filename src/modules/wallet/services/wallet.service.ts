import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, WalletTransactionType } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { PaymentProviderFactory } from 'src/modules/payment/providers/payment.provider.factory';
import { normalizeMozMsisdn } from 'src/modules/payment/utils/phone.util';

import {
  WalletSelfTopUpRequestDto,
  WalletTopUpRequestDto,
} from '../dtos/request/wallet.request';
import { WalletResponseDto } from '../dtos/response/wallet.response';

const DEFAULT_CURRENCY = 'MZN';

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
    private readonly paymentProviderFactory: PaymentProviderFactory
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
  ): Promise<WalletResponseDto> {
    await this.assertUserExists(userId);

    const amount = this.toPositiveDecimal(dto.amount);
    const msisdn = normalizeMozMsisdn(dto.phone);

    if (!msisdn) {
      throw new HttpException(
        'payment.error.invalidPhone',
        HttpStatus.BAD_REQUEST
      );
    }

    const reference = this.reference('TOPUP');
    const provider = this.paymentProviderFactory.getProvider(
      PaymentMethod.MPESA
    );
    const result = await provider.charge({
      amount: Number(amount),
      currency: DEFAULT_CURRENCY,
      phone: msisdn,
      reference,
      thirdPartyRef: reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 20),
    });

    if (!result.success) {
      throw new HttpException(
        result.providerMessage || 'payment.error.declined',
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    await this.db.$transaction(async tx => {
      await this.createTopUpTransaction(tx, {
        amount,
        note: 'Recarga via M-Pesa',
        paymentReference: result.providerTransactionId ?? reference,
        reference,
        userId,
      });
    });

    return this.getWallet(userId);
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
    return `TUNDURO-WALLET-${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
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
