import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { IPaymentProvider } from './payment.provider.interface';
import { PaysuiteProvider } from './paysuite/paysuite.provider';
import { ZenofyProvider } from './zenofy/zenofy.provider';

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private readonly paysuiteProvider: PaysuiteProvider,
    private readonly zenofyProvider: ZenofyProvider
  ) {}

  getProvider(method: PaymentMethod): IPaymentProvider {
    switch (method) {
      case PaymentMethod.MPESA:
      case PaymentMethod.EMOLA:
        return this.paysuiteProvider;
      case PaymentMethod.CARD:
        return this.zenofyProvider;
      case PaymentMethod.CASH:
      default:
        throw new HttpException(
          'payment.error.unsupportedMethod',
          HttpStatus.BAD_REQUEST
        );
    }
  }
}
