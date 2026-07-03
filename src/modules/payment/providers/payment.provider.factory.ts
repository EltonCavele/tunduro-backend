import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { IPaymentProvider } from './payment.provider.interface';
import { PaysuiteProvider } from './paysuite/paysuite.provider';

@Injectable()
export class PaymentProviderFactory {
  constructor(private readonly paysuiteProvider: PaysuiteProvider) {}

  getProvider(method: PaymentMethod): IPaymentProvider {
    switch (method) {
      case PaymentMethod.MPESA:
      case PaymentMethod.EMOLA:
      case PaymentMethod.CARD:
        return this.paysuiteProvider;
      case PaymentMethod.CASH:
      default:
        throw new HttpException(
          'payment.error.unsupportedMethod',
          HttpStatus.BAD_REQUEST
        );
    }
  }
}
