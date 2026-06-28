import { HttpException } from '@nestjs/common';
import { PaymentMethod, Prisma, WalletTransactionType } from '@prisma/client';

import { WalletService } from 'src/modules/wallet/services/wallet.service';

describe('WalletService', () => {
  function createService() {
    const tx = {
      wallet: {
        upsert: jest.fn().mockResolvedValue({
          userId: 'user-1',
          balance: new Prisma.Decimal(1500),
          currency: 'MZN',
        }),
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
      walletTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const provider = {
      charge: jest.fn().mockResolvedValue({
        success: true,
        status: 'COMPLETED',
        providerTransactionId: 'mpesa-1',
        providerStatusCode: 'INS-0',
        providerMessage: 'OK',
      }),
    };
    const paymentProviderFactory = {
      getProvider: jest.fn().mockReturnValue(provider),
    };

    return {
      db,
      paymentProviderFactory,
      provider,
      service: new WalletService(db as any, paymentProviderFactory as any),
      tx,
    };
  }

  it('charges M-Pesa before crediting a public top-up', async () => {
    const { paymentProviderFactory, provider, service, tx } = createService();

    const wallet = await service.selfTopUp('user-1', {
      amount: 1500,
      phone: '84 123 4567',
    });

    expect(paymentProviderFactory.getProvider).toHaveBeenCalledWith(
      PaymentMethod.MPESA
    );
    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500,
        currency: 'MZN',
        phone: '258841234567',
      })
    );
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(1500),
        createdByUserId: null,
        note: 'Recarga via M-Pesa',
        paymentReference: 'mpesa-1',
        type: WalletTransactionType.TOP_UP,
        userId: 'user-1',
      }),
    });
    expect(wallet.balance).toBe(1500);
  });

  it('rejects invalid M-Pesa numbers without charging', async () => {
    const { provider, service } = createService();

    await expect(
      service.selfTopUp('user-1', {
        amount: 1500,
        phone: '801234567',
      })
    ).rejects.toBeInstanceOf(HttpException);
    expect(provider.charge).not.toHaveBeenCalled();
  });
});
