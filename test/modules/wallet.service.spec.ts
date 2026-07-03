import {
  PaymentMethod,
  Prisma,
  WalletTopUpSessionStatus,
  WalletTransactionType,
} from '@prisma/client';

import { WalletService } from 'src/modules/wallet/services/wallet.service';

describe('WalletService', () => {
  function createService() {
    const topUpSession = {
      amount: new Prisma.Decimal(1500),
      checkoutUrl: null,
      completedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      currency: 'MZN',
      expiresAt: new Date('2026-01-01T00:30:00Z'),
      failureReason: null,
      id: 'top-up-session-1',
      metadata: { intent: 'wallet_top_up' },
      paidAt: null,
      paymentMethod: PaymentMethod.MPESA,
      phone: '258841234567',
      providerMessage: null,
      providerPaymentId: null,
      providerStatusCode: null,
      providerTransactionId: null,
      reference: 'TUNDUROWALLETTOPUPABC12345',
      status: WalletTopUpSessionStatus.OPEN,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      userId: 'user-1',
    };
    const tx = {
      wallet: {
        upsert: jest.fn().mockResolvedValue({
          userId: 'user-1',
          balance: new Prisma.Decimal(1500),
          currency: 'MZN',
        }),
      },
      walletTopUpSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      walletTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'wallet-tx-1' }),
      },
    };
    const db = {
      $transaction: jest.fn(
        (handler: (client: typeof tx) => Promise<unknown>) => handler(tx)
      ),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', deletedAt: null }),
      },
      wallet: {
        upsert: jest.fn().mockResolvedValue({
          userId: 'user-1',
          balance: new Prisma.Decimal(1500),
          currency: 'MZN',
        }),
      },
      walletTopUpSession: {
        create: jest.fn().mockResolvedValue(topUpSession),
        findFirst: jest.fn().mockResolvedValue({
          ...topUpSession,
          status: WalletTopUpSessionStatus.COMPLETED,
        }),
        update: jest.fn().mockResolvedValue({
          ...topUpSession,
          checkoutUrl: 'https://paysuite.test/checkout/1',
          providerPaymentId: 'pay-1',
          providerStatusCode: 'pending',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      walletTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const provider = {
      charge: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://paysuite.test/checkout/1',
        providerPaymentId: 'pay-1',
        providerStatusCode: 'pending',
        providerMessage: 'pending',
        success: true,
        status: 'PENDING',
      }),
    };
    const paymentProviderFactory = {
      getProvider: jest.fn().mockReturnValue(provider),
    };
    const paymentTransactions = {
      completeWalletTopUpPayment: jest.fn().mockResolvedValue(undefined),
      markWalletTopUpCancelled: jest.fn().mockResolvedValue(undefined),
      markWalletTopUpFailed: jest.fn().mockResolvedValue(undefined),
      markWalletTopUpPending: jest.fn().mockResolvedValue(undefined),
    };

    return {
      db,
      paymentTransactions,
      paymentProviderFactory,
      provider,
      service: new WalletService(
        db as any,
        paymentProviderFactory as any,
        paymentTransactions as any
      ),
      topUpSession,
      tx,
    };
  }

  it('creates a PaySuite top-up session before crediting a public top-up', async () => {
    const { db, paymentProviderFactory, paymentTransactions, provider, service, tx } =
      createService();

    const session = await service.selfTopUp('user-1', {
      amount: 1500,
    });

    expect(paymentProviderFactory.getProvider).toHaveBeenCalledWith(
      PaymentMethod.MPESA
    );
    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500,
        currency: 'MZN',
        sessionId: 'top-up-session-1',
      })
    );
    expect(db.walletTopUpSession.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checkoutUrl: 'https://paysuite.test/checkout/1',
        providerPaymentId: 'pay-1',
        providerStatusCode: 'pending',
      }),
      where: { id: 'top-up-session-1' },
    });
    expect(paymentTransactions.markWalletTopUpPending).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'top-up-session-1' }),
      PaymentMethod.MPESA,
      expect.objectContaining({ status: 'PENDING' })
    );
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(session.checkoutUrl).toBe('https://paysuite.test/checkout/1');
  });

  it('starts a public top-up without a phone number', async () => {
    const { provider, service } = createService();

    await service.selfTopUp('user-1', {
      amount: 1500,
    });

    expect(provider.charge).toHaveBeenCalledWith(
      expect.not.objectContaining({
        phone: expect.anything(),
      })
    );
  });

  it('credits a public top-up only after provider payment is completed', async () => {
    const { paymentTransactions, provider, service, tx } = createService();
    provider.charge.mockResolvedValueOnce({
      providerPaymentId: 'pay-1',
      providerStatusCode: 'paid',
      providerMessage: 'paid',
      providerTransactionId: 'mpesa-1',
      status: 'COMPLETED',
      success: true,
    });

    await service.selfTopUp('user-1', {
      amount: 1500,
    });

    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(1500),
        createdByUserId: null,
        note: 'Recarga via PaySuite',
        paymentReference: 'mpesa-1',
        type: WalletTransactionType.TOP_UP,
        userId: 'user-1',
      }),
    });
    expect(paymentTransactions.completeWalletTopUpPayment).toHaveBeenCalled();
  });

  it('marks the pending payment as cancelled when a top-up session expires', async () => {
    const { db, paymentTransactions, service, topUpSession } = createService();
    db.walletTopUpSession.findFirst
      .mockResolvedValueOnce({
        ...topUpSession,
        expiresAt: new Date(Date.now() - 60_000),
      })
      .mockResolvedValueOnce({
        ...topUpSession,
        status: WalletTopUpSessionStatus.EXPIRED,
      });

    await service.getTopUpSession('user-1', 'top-up-session-1');

    expect(db.walletTopUpSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'top-up-session-1',
        status: WalletTopUpSessionStatus.OPEN,
      },
      data: { status: WalletTopUpSessionStatus.EXPIRED },
    });
    expect(paymentTransactions.markWalletTopUpCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'top-up-session-1' }),
      PaymentMethod.MPESA,
      'session timeout',
      'expired'
    );
  });
});
