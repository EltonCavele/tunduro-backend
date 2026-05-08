import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';

import {
  ChargeInput,
  ChargeResult,
  IPaymentProvider,
} from '../payment.provider.interface';
import { MpesaClient } from './mpesa.client';

const MPESA_SUCCESS_CODE = 'INS-0';

@Injectable()
export class MpesaProvider implements IPaymentProvider {
  readonly method = PaymentMethod.MPESA;
  private readonly logger = new Logger(MpesaProvider.name);

  constructor(
    private readonly client: MpesaClient,
    private readonly configService: ConfigService
  ) {}

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!input.phone) {
      return {
        success: false,
        status: 'FAILED',
        providerStatusCode: 'INVALID_PHONE',
        providerMessage: 'payment.error.invalidPhone',
      };
    }

    const serviceProviderCode =
      this.configService.get<string>('payment.mpesa.serviceProviderCode') ?? '';

    const transactionRef = input.reference.slice(0, 12);
    const thirdPartyRef = input.thirdPartyRef.slice(0, 20);

    try {
      const response = await this.client.c2bPayment({
        input_TransactionReference: transactionRef,
        input_CustomerMSISDN: input.phone,
        input_Amount: input.amount.toFixed(2),
        input_ThirdPartyReference: thirdPartyRef,
        input_ServiceProviderCode: serviceProviderCode,
      });

      const success = response.output_ResponseCode === MPESA_SUCCESS_CODE;

      return {
        success,
        status: success ? 'COMPLETED' : 'FAILED',
        providerTransactionId: response.output_TransactionID,
        providerStatusCode: response.output_ResponseCode,
        providerMessage:
          response.output_ResponseDesc ?? (success ? 'OK' : 'Payment declined'),
      };
    } catch (error) {
      const message = (error as Error)?.message ?? 'payment.error.gatewayUnavailable';
      this.logger.error(`M-Pesa charge failed: ${message}`);

      return {
        success: false,
        status: 'FAILED',
        providerStatusCode: 'GATEWAY_ERROR',
        providerMessage: message,
      };
    }
  }
}
