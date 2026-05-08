import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { IPaymentProvider } from './payment.provider.interface';
import { MpesaProvider } from './mpesa/mpesa.provider';

@Injectable()
export class PaymentProviderFactory {
  constructor(private readonly mpesaProvider: MpesaProvider) {}

  getProvider(method: PaymentMethod): IPaymentProvider {
    switch (method) {
      case PaymentMethod.MPESA:
        return this.mpesaProvider;
      case PaymentMethod.EMOLA:
      case PaymentMethod.CARD:
      case PaymentMethod.CASH:
      default:
        throw new HttpException(
          'payment.error.unsupportedMethod',
          HttpStatus.BAD_REQUEST
        );
    }
  }
}
