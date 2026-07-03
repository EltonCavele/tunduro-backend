import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import axios from 'axios';

import {
  ChargeInput,
  ChargeOutcomeStatus,
  ChargeResult,
  IPaymentProvider,
  PaymentStatusInput,
} from '../payment.provider.interface';
import { normalizePaysuiteReference } from '../../helpers/payment-reference.helper';

interface PaysuitePaymentData {
  checkout_url?: string;
  id?: number | string;
  reference?: string;
  status?: string;
  transaction?: {
    id?: number | string;
    paid_at?: string;
    status?: string;
    transaction_id?: number | string;
  };
}

interface PaysuiteResponse {
  data?: PaysuitePaymentData;
  message?: string;
  status?: string;
}

@Injectable()
export class PaysuiteProvider implements IPaymentProvider {
  readonly method = PaymentMethod.MPESA;
  private readonly logger = new Logger(PaysuiteProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const token = this.apiToken();
    if (!token) {
      this.logger.error('PaySuite API token is missing');
      return this.failure(
        'CONFIGURATION_ERROR',
        'payment.error.gatewayUnavailable'
      );
    }

    const reference = normalizePaysuiteReference(input.reference);
    if (!reference) {
      return this.failure('INVALID_REFERENCE', 'payment.error.invalidReference');
    }

    const payload: Record<string, string> = {
      amount: input.amount.toFixed(2),
      description: (input.description ?? `Tunduro ${input.reference}`).slice(
        0,
        125
      ),
      method: this.mapMethod(input.method),
      reference,
    };
    const returnUrl = this.buildReturnUrl(
      input.sessionId ?? input.reference,
      reference.startsWith('TUNDUROWALLET') ? 'wallet' : 'booking'
    );
    const callbackUrl = this.buildCallbackUrl();

    if (returnUrl) payload.return_url = returnUrl;
    if (callbackUrl) payload.callback_url = callbackUrl;

    try {
      const response = await axios.post<PaysuiteResponse>(
        `${this.apiUrl()}/payments`,
        payload,
        {
          headers: this.headers(token),
          timeout: this.requestTimeoutMs(),
        }
      );

      return this.mapPaymentData(
        response.data?.data,
        'PaySuite payment created'
      );
    } catch (error) {
      return this.mapError(error, 'PaySuite payment creation failed');
    }
  }

  async getStatus(input: PaymentStatusInput): Promise<ChargeResult> {
    const token = this.apiToken();
    const paymentId = input.providerPaymentId ?? input.providerTransactionId;
    if (!token || !paymentId) {
      return this.failure(
        'CONFIGURATION_ERROR',
        'payment.error.gatewayUnavailable'
      );
    }

    try {
      const response = await axios.get<PaysuiteResponse>(
        `${this.apiUrl()}/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: this.headers(token),
          timeout: this.requestTimeoutMs(),
        }
      );

      return this.mapPaymentData(
        response.data?.data,
        'PaySuite payment status fetched'
      );
    } catch (error) {
      return this.mapError(error, 'PaySuite payment status failed');
    }
  }

  private apiToken(): string {
    return (
      this.configService.get<string>('payment.paysuite.apiToken')?.trim() ?? ''
    );
  }

  private apiUrl(): string {
    const url =
      this.configService.get<string>('payment.paysuite.apiUrl') ??
      'https://paysuite.tech/api/v1';
    return url.replace(/\/+$/, '');
  }

  private requestTimeoutMs(): number {
    return (
      this.configService.get<number>('payment.paysuite.requestTimeoutMs') ??
      30000
    );
  }

  private headers(token: string): Record<string, string> {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private buildCallbackUrl(): string | undefined {
    const callbackUrl = this.configService
      .get<string>('payment.paysuite.callbackUrl')
      ?.trim();

    if (callbackUrl && this.isWebUrl(callbackUrl)) {
      return callbackUrl;
    }

    return this.buildPublicUrl('/v1/payments/paysuite/webhook')?.toString();
  }

  private buildReturnUrl(
    sessionId: string,
    kind: 'booking' | 'wallet'
  ): string | undefined {
    const url = this.buildPublicUrl('/v1/payments/paysuite/return');
    if (!url) {
      return undefined;
    }

    url.searchParams.set('kind', kind);
    url.searchParams.set('sessionId', sessionId);
    return url.toString();
  }

  private buildPublicUrl(pathname: string): URL | undefined {
    const configuredBase = this.configService
      .get<string>('payment.paysuite.publicBaseUrl')
      ?.trim();
    const callbackUrl = this.configService
      .get<string>('payment.paysuite.callbackUrl')
      ?.trim();

    const base = configuredBase || this.getOrigin(callbackUrl);
    if (!base) {
      return undefined;
    }

    try {
      const url = new URL(pathname, base.endsWith('/') ? base : `${base}/`);
      if (!this.isWebUrl(url.toString())) {
        this.logger.warn(
          `PaySuite public URL ignored because protocol is not supported: ${url.protocol}`
        );
        return undefined;
      }

      return url;
    } catch {
      this.logger.warn('PaySuite public URL ignored because it is invalid');
      return undefined;
    }
  }

  private getOrigin(value: string | undefined): string {
    if (!value) {
      return '';
    }

    try {
      const url = new URL(value);
      return this.isWebUrl(url.toString()) ? url.origin : '';
    } catch {
      return '';
    }
  }

  private isWebUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private mapMethod(method: PaymentMethod): string {
    if (method === PaymentMethod.EMOLA) return 'emola';
    if (method === PaymentMethod.CARD) return 'credit_card';
    return 'mpesa';
  }

  private mapPaymentData(
    payment: PaysuitePaymentData | undefined,
    defaultMessage: string
  ): ChargeResult {
    if (!payment?.id) {
      return this.failure(
        'INVALID_RESPONSE',
        'payment.error.gatewayUnavailable'
      );
    }

    const status = this.mapStatus(payment.status, payment.transaction?.status);
    const transactionId =
      payment.transaction?.transaction_id ??
      payment.transaction?.id ??
      undefined;

    return {
      checkoutUrl: payment.checkout_url,
      providerPaymentId: String(payment.id),
      providerPayload: payment as Record<string, unknown>,
      providerStatusCode: payment.status ?? status,
      providerMessage: defaultMessage,
      providerTransactionId: transactionId
        ? String(transactionId)
        : String(payment.id),
      status,
      success: status !== 'FAILED',
    };
  }

  private mapStatus(
    paymentStatus: string | undefined,
    transactionStatus: string | undefined
  ): ChargeOutcomeStatus {
    const status =
      `${paymentStatus ?? ''} ${transactionStatus ?? ''}`.toLowerCase();
    if (
      status.includes('paid') ||
      status.includes('success') ||
      status.includes('completed')
    ) {
      return 'COMPLETED';
    }
    if (
      status.includes('failed') ||
      status.includes('cancelled') ||
      status.includes('canceled') ||
      status.includes('declined') ||
      status.includes('rejected') ||
      status.includes('expired')
    ) {
      return 'FAILED';
    }

    return 'PENDING';
  }

  private mapError(error: unknown, context: string): ChargeResult {
    if (axios.isAxiosError(error)) {
      const code = error.response?.status
        ? String(error.response.status)
        : (error.code ?? 'GATEWAY_ERROR');
      const responseData = error.response?.data as PaysuiteResponse | undefined;
      const message =
        responseData?.message ??
        error.message ??
        (code === 'ECONNABORTED'
          ? 'payment.error.timeout'
          : 'payment.error.gatewayUnavailable');

      this.logger.warn(`${context}: ${code} ${message}`);
      return this.failure(code, message);
    }

    const message =
      (error as Error)?.message ?? 'payment.error.gatewayUnavailable';
    this.logger.warn(`${context}: ${message}`);
    return this.failure('GATEWAY_ERROR', message);
  }

  private failure(
    providerStatusCode: string,
    providerMessage: string
  ): ChargeResult {
    return {
      providerStatusCode,
      providerMessage,
      status: 'FAILED',
      success: false,
    };
  }
}
