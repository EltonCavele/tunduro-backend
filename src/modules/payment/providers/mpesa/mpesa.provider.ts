import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import * as mpesa from 'mpesa-node-api';

import {
  ChargeInput,
  ChargeResult,
  IPaymentProvider,
} from '../payment.provider.interface';

const MPESA_SUCCESS_CODE = 'INS-0';

@Injectable()
export class MpesaProvider implements IPaymentProvider {
  readonly method = PaymentMethod.MPESA;
  private readonly logger = new Logger(MpesaProvider.name);
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  private ensureInitialized(): void {
    if (this.initialized) return;

    const baseUrl = this.configService.get<string>('payment.mpesa.host') ?? '';
    const apiKey = this.configService.get<string>('payment.mpesa.apiKey') ?? '';
    const publicKey =
      this.configService.get<string>('payment.mpesa.publicKey') ?? '';
    const origin = this.configService.get<string>('payment.mpesa.origin') ?? '';
    const serviceProviderCode =
      this.configService.get<string>('payment.mpesa.serviceProviderCode') ?? '';

    if (!baseUrl || !apiKey || !publicKey || !origin || !serviceProviderCode) {
      throw new Error('payment.error.gatewayUnavailable');
    }

    mpesa.initializeApi({
      baseUrl,
      apiKey,
      publicKey,
      origin,
      serviceProviderCode,
    });
    this.initialized = true;
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!input.phone) {
      return {
        success: false,
        status: 'FAILED',
        providerStatusCode: 'INVALID_PHONE',
        providerMessage: 'payment.error.invalidPhone',
      };
    }

    try {
      this.ensureInitialized();
    } catch (error) {
      this.logger.error(
        `M-Pesa init failed: ${(error as Error)?.message}`
      );
      return {
        success: false,
        status: 'FAILED',
        providerStatusCode: 'GATEWAY_ERROR',
        providerMessage: 'payment.error.gatewayUnavailable',
      };
    }

    const transactionRef = input.reference.slice(0, 12);
    const thirdPartyRef = input.thirdPartyRef.slice(0, 20);

    try {
      const response = await mpesa.initiate_c2b(
        input.amount,
        input.phone,
        transactionRef,
        thirdPartyRef
      );

      const success = response.output_ResponseCode === MPESA_SUCCESS_CODE;

      return {
        success,
        status: success ? 'COMPLETED' : 'FAILED',
        providerTransactionId: response.output_TransactionID,
        providerStatusCode: response.output_ResponseCode,
        providerMessage:
          response.output_ResponseDesc ?? (success ? 'OK' : 'Payment declined'),
      };
    } catch (error: any) {
      const code = error?.output_ResponseCode ?? 'GATEWAY_ERROR';
      const message =
        error?.output_ResponseDesc ??
        error?.message ??
        'payment.error.gatewayUnavailable';
      this.logger.error(`M-Pesa charge failed: ${code} - ${message}`);

      return {
        success: false,
        status: 'FAILED',
        providerStatusCode: code,
        providerMessage: message,
      };
    }
  }
}
