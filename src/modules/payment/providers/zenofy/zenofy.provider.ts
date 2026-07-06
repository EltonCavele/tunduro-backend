import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import axios from 'axios';

import { normalizeZenofyPhoneNumber } from '../../helpers/zenofy-payment.helper';
import {
  ChargeInput,
  ChargeOutcomeStatus,
  ChargeResult,
  IPaymentProvider,
  PaymentStatusInput,
} from '../payment.provider.interface';

interface ZenofyCreateOrderResponse {
  checkout_id?: string;
  checkout_url?: string;
  expires_at?: string;
  message?: string;
  success?: boolean;
}

interface ZenofyOrderStatusResponse {
  currency?: string;
  message?: string;
  orderId?: string;
  status?: string;
  success?: boolean;
  totalAmount?: number;
}

@Injectable()
export class ZenofyProvider implements IPaymentProvider {
  readonly method = PaymentMethod.CARD;
  private readonly logger = new Logger(ZenofyProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const apiKey = this.apiKey();
    const productId = this.productId();
    if (!apiKey || !productId) {
      this.logger.error('Zenofy API key or booking product id is missing');
      return this.failure(
        'CONFIGURATION_ERROR',
        'payment.error.gatewayUnavailable'
      );
    }

    const phoneNumber = normalizeZenofyPhoneNumber(input.phone);
    if (!phoneNumber) {
      return this.failure(
        'INVALID_CUSTOMER_PHONE',
        'payment.error.cardPhoneRequired'
      );
    }

    const email = input.customerEmail?.trim().toLowerCase();
    if (!email) {
      return this.failure(
        'INVALID_CUSTOMER_EMAIL',
        'payment.error.invalidCustomer'
      );
    }

    const checkoutUrl = this.buildReturnUrl(
      input.sessionId ?? input.reference,
      input.reference
    );
    const payload = {
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      customer: {
        email,
        name: this.customerName(input.customerName),
        phone: phoneNumber,
      },
      description: input.description ?? `Tunduro ${input.reference}`,
      language: 'pt',
      payment_methods: ['card'],
      productId,
      reference: input.reference,
      ...(checkoutUrl
        ? { cancel_url: checkoutUrl, success_url: checkoutUrl }
        : {}),
    };

    try {
      const response = await axios.post<ZenofyCreateOrderResponse>(
        `${this.apiUrl()}/checkout/order-api-gateway`,
        payload,
        {
          headers: this.headers(apiKey),
          timeout: this.requestTimeoutMs(),
        }
      );

      return this.mapCreateResponse(response.data);
    } catch (error) {
      return this.mapError(error, 'Zenofy order creation failed');
    }
  }

  async getStatus(input: PaymentStatusInput): Promise<ChargeResult> {
    const apiKey = this.apiKey();
    const orderId = input.providerPaymentId ?? input.providerTransactionId;
    if (!apiKey || !orderId) {
      return this.failure(
        'CONFIGURATION_ERROR',
        'payment.error.gatewayUnavailable'
      );
    }

    try {
      const response = await axios.get<ZenofyOrderStatusResponse>(
        `${this.apiUrl()}/checkout/order-status`,
        {
          headers: this.headers(apiKey),
          params: { orderId },
          timeout: this.requestTimeoutMs(),
        }
      );

      return this.mapStatusResponse(response.data);
    } catch (error) {
      return this.mapError(error, 'Zenofy order status failed');
    }
  }

  private apiKey(): string {
    return (
      this.configService.get<string>('payment.zenofy.checkoutApiKey')?.trim() ??
      ''
    );
  }

  private apiUrl(): string {
    const url =
      this.configService.get<string>('payment.zenofy.apiUrl') ??
      'https://api.zenofy.io';
    return url.replace(/\/+$/, '');
  }

  private productId(): string {
    return (
      this.configService.get<string>('payment.zenofy.bookingProductId')?.trim() ??
      ''
    );
  }

  private requestTimeoutMs(): number {
    return (
      this.configService.get<number>('payment.zenofy.requestTimeoutMs') ??
      30000
    );
  }

  private buildReturnUrl(
    sessionId: string,
    reference: string
  ): string | undefined {
    const url = this.buildPublicUrl('/v1/payments/zenofy/return');
    if (!url) {
      return undefined;
    }

    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('reference', reference);
    return url.toString();
  }

  private buildPublicUrl(pathname: string): URL | undefined {
    const configuredBase = this.configService
      .get<string>('payment.zenofy.publicBaseUrl')
      ?.trim();
    const paysuiteBase = this.configService
      .get<string>('payment.paysuite.publicBaseUrl')
      ?.trim();
    const paysuiteCallback = this.configService
      .get<string>('payment.paysuite.callbackUrl')
      ?.trim();
    const base =
      configuredBase || paysuiteBase || this.getOrigin(paysuiteCallback);
    if (!base) {
      return undefined;
    }

    try {
      const url = new URL(pathname, base.endsWith('/') ? base : `${base}/`);
      if (url.protocol !== 'https:') {
        this.logger.warn('Zenofy return URL ignored because it is not HTTPS');
        return undefined;
      }
      return url;
    } catch {
      this.logger.warn('Zenofy return URL ignored because it is invalid');
      return undefined;
    }
  }

  private getOrigin(value: string | undefined): string {
    if (!value) {
      return '';
    }

    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.origin : '';
    } catch {
      return '';
    }
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      Accept: 'application/json',
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }

  private customerName(value: string | undefined): string {
    const name = value?.trim().replace(/\s+/g, ' ') ?? '';
    return name.split(' ').length >= 2 ? name : 'Cliente Tunduro';
  }

  private mapCreateResponse(response: ZenofyCreateOrderResponse): ChargeResult {
    if (
      response.success === false ||
      !response.checkout_id ||
      !response.checkout_url
    ) {
      return this.failure(
        'INVALID_RESPONSE',
        response.message ?? 'payment.error.gatewayUnavailable'
      );
    }

    return {
      checkoutUrl: response.checkout_url,
      providerPaymentId: response.checkout_id,
      providerPayload: response as Record<string, unknown>,
      providerStatusCode: 'PENDING',
      providerMessage: 'Zenofy order created',
      providerTransactionId: response.checkout_id,
      status: 'PENDING',
      success: true,
    };
  }

  private mapStatusResponse(
    response: ZenofyOrderStatusResponse
  ): ChargeResult {
    if (!response.success || !response.orderId) {
      return this.failure(
        'INVALID_RESPONSE',
        response.message ?? 'payment.error.gatewayUnavailable'
      );
    }

    const status = this.mapStatus(response.status);
    return {
      providerPaymentId: response.orderId,
      providerPayload: response as Record<string, unknown>,
      providerStatusCode: response.status ?? status,
      providerMessage: 'Zenofy order status fetched',
      providerTransactionId: response.orderId,
      status,
      success: status !== 'FAILED',
    };
  }

  private mapStatus(status: string | undefined): ChargeOutcomeStatus {
    const normalized = status?.trim().toUpperCase();
    if (normalized === 'PAID' || normalized === 'SUCCEEDED') {
      return 'COMPLETED';
    }
    if (
      normalized === 'CANCELLED' ||
      normalized === 'CANCELED' ||
      normalized === 'EXPIRED' ||
      normalized === 'REFUNDED' ||
      normalized === 'CHARGEBACK'
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
      const responseData = error.response?.data as
        | ZenofyCreateOrderResponse
        | ZenofyOrderStatusResponse
        | undefined;
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
