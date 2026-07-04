import { HttpException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { PaymentProviderFactory } from 'src/modules/payment/providers/payment.provider.factory';

describe('PaymentProviderFactory', () => {
  it('routes card payments to Zenofy and mobile money to PaySuite', () => {
    const paysuiteProvider = { method: PaymentMethod.MPESA };
    const zenofyProvider = { method: PaymentMethod.CARD };
    const factory = new PaymentProviderFactory(
      paysuiteProvider as any,
      zenofyProvider as any
    );

    expect(factory.getProvider(PaymentMethod.MPESA)).toBe(paysuiteProvider);
    expect(factory.getProvider(PaymentMethod.EMOLA)).toBe(paysuiteProvider);
    expect(factory.getProvider(PaymentMethod.CARD)).toBe(zenofyProvider);
  });

  it('rejects methods without an external provider', () => {
    const factory = new PaymentProviderFactory({} as any, {} as any);

    expect(() => factory.getProvider(PaymentMethod.CASH)).toThrow(
      HttpException
    );
  });
});
