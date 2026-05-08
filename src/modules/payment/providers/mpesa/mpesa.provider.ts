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

    const missing = [
      !baseUrl && 'host',
      !apiKey && 'apiKey',
      !publicKey && 'publicKey',
      !origin && 'origin',
      !serviceProviderCode && 'serviceProviderCode',
    ].filter(Boolean);

    if (missing.length > 0) {
      this.logger.error(
        `M-Pesa configuration missing fields: ${missing.join(', ')}`
      );
      throw new Error('payment.error.gatewayUnavailable');
    }

    this.logger.log(
      `Initializing M-Pesa client (host=${baseUrl}, origin=${origin}, providerCode=${serviceProviderCode})`
    );

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
      this.logger.warn('M-Pesa charge requested without phone');
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

    const transactionRef = this.sanitizeRef(input.reference, 20);
    const thirdPartyRef = this.sanitizeRef(input.thirdPartyRef, 20);
    const maskedPhone = this.maskMsisdn(input.phone);

    if (!transactionRef || !thirdPartyRef) {
      this.logger.error(
        `M-Pesa charge aborted: empty ref after sanitize (transactionRef="${transactionRef}", thirdPartyRef="${thirdPartyRef}")`
      );
      return {
        success: false,
        status: 'FAILED',
        providerStatusCode: 'INVALID_REFERENCE',
        providerMessage: 'payment.error.gatewayUnavailable',
      };
    }

    this.logger.log(
      `M-Pesa charge → msisdn=${maskedPhone}, amount=${input.amount} ${input.currency}, ref=${transactionRef}, thirdPartyRef=${thirdPartyRef}`
    );

    try {
      const response = await mpesa.initiate_c2b(
        input.amount,
        input.phone,
        transactionRef,
        thirdPartyRef
      );

      const code = response.output_ResponseCode;
      const desc = response.output_ResponseDesc ?? '';
      const success = code === MPESA_SUCCESS_CODE;

      if (success) {
        this.logger.log(
          `M-Pesa charge ✓ ${code} (txId=${response.output_TransactionID ?? 'n/a'}) — ${desc}`
        );
      } else {
        this.logger.warn(`M-Pesa charge ✗ ${code} — ${desc}`);
      }

      return {
        success,
        status: success ? 'COMPLETED' : 'FAILED',
        providerTransactionId: response.output_TransactionID,
        providerStatusCode: code,
        providerMessage: desc || (success ? 'OK' : 'Payment declined'),
      };
    } catch (error: any) {
      const code = error?.output_ResponseCode ?? 'GATEWAY_ERROR';
      const desc =
        error?.output_ResponseDesc ??
        error?.message ??
        'payment.error.gatewayUnavailable';
      this.logger.error(
        `M-Pesa charge ✗ ${code} — ${desc} (msisdn=${maskedPhone}, ref=${transactionRef})`
      );
      if (code === 'GATEWAY_ERROR' && error?.stack) {
        this.logger.debug(error.stack);
      }

      return {
        success: false,
        status: 'FAILED',
        providerStatusCode: code,
        providerMessage: desc,
      };
    }
  }

  private maskMsisdn(phone: string): string {
    if (phone.length <= 4) return `*** ${phone}`;
    return `${phone.slice(0, 3)} *** ${phone.slice(-2)}`;
  }

  /**
   * O M-Pesa Mozambique aceita apenas caracteres alfanuméricos
   * em `input_TransactionReference` e `input_ThirdPartyReference`.
   * Qualquer hífen / underscore / espaço devolve INS-17.
   */
  private sanitizeRef(value: string, maxLength: number): string {
    return value.replace(/[^A-Za-z0-9]/g, '').slice(0, maxLength);
  }
}
