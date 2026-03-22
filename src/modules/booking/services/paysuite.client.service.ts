import { createHmac, timingSafeEqual } from 'crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface PaysuiteEnvelope<T> {
  data: T;
  message?: string;
  status?: string;
}

interface PaysuitePaymentTransaction {
  id?: number | string;
  method?: string | null;
  paid_at?: string | null;
  status?: string | null;
  transaction_id?: string | null;
}

export interface PaysuitePaymentRequest {
  amount: number;
  checkout_url?: string | null;
  id: string;
  reference: string;
  status: string;
  transaction?: PaysuitePaymentTransaction | null;
}

export interface PaysuiteRefund {
  amount: number;
  id: string;
  payment_id: string;
  reason: string;
  status: string;
}

export interface PaysuiteWebhookPayload {
  created_at: number;
  data: {
    amount: number;
    error?: string;
    id: string;
    reference: string;
    transaction?: {
      id?: string;
      method?: string;
      paid_at?: string;
      status?: string;
    };
  };
  event: 'payment.success' | 'payment.failed' | string;
  request_id: string;
}

@Injectable()
export class PaysuiteClientService {
  private readonly apiBaseUrl: string;
  private readonly apiToken: string;
  private readonly webhookSecret: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.apiBaseUrl = this.configService.get<string>('paysuite.apiBaseUrl', {
      infer: true,
    }) as string;
    this.apiToken = this.configService.get<string>('paysuite.apiToken', {
      infer: true,
    }) as string;
    this.webhookSecret = this.configService.get<string>(
      'paysuite.webhookSecret',
      {
        infer: true,
      }
    ) as string;
    this.timeoutMs = this.configService.get<number>('paysuite.timeoutMs', {
      infer: true,
    }) as number;
  }

  getAppPublicUrl(): string {
    return this.configService.get<string>('paysuite.appPublicUrl', {
      infer: true,
    }) as string;
  }

  getMobileDeepLinkScheme(): string {
    return this.configService.get<string>('paysuite.mobileDeepLinkScheme', {
      infer: true,
    }) as string;
  }

  async createPaymentRequest(payload: {
    amount: string;
    callback_url: string;
    description: string;
    reference: string;
    return_url: string;
  }): Promise<PaysuitePaymentRequest> {
    return this.request<PaysuitePaymentRequest>({
      data: payload,
      method: 'POST',
      path: '/api/v1/payments',
    });
  }

  async getPaymentRequest(paymentId: string): Promise<PaysuitePaymentRequest> {
    return this.request<PaysuitePaymentRequest>({
      method: 'GET',
      path: `/api/v1/payments/${paymentId}`,
    });
  }

  async createRefund(payload: {
    amount: string;
    payment_id: string;
    reason: string;
  }): Promise<PaysuiteRefund> {
    return this.request<PaysuiteRefund>({
      data: payload,
      method: 'POST',
      path: '/api/v1/refunds',
    });
  }

  async getRefund(refundId: string): Promise<PaysuiteRefund> {
    return this.request<PaysuiteRefund>({
      method: 'GET',
      path: `/api/v1/refunds/${refundId}`,
    });
  }

  verifyWebhookSignature(rawBody: string, signature?: string | null): boolean {
    if (!signature || !this.webhookSecret) {
      return false;
    }

    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private async request<T>({
    data,
    method,
    path,
  }: {
    data?: unknown;
    method: 'GET' | 'POST';
    path: string;
  }): Promise<T> {
    if (!this.apiToken) {
      throw new HttpException(
        'payment.error.paysuiteNotConfigured',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.request<PaysuiteEnvelope<T>>({
          baseURL: this.apiBaseUrl,
          data,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          method,
          timeout: this.timeoutMs,
          url: path,
        })
      );

      return response.data.data;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'payment.error.providerUnavailable';

      const status =
        error?.response?.status && Number.isInteger(error.response.status)
          ? error.response.status
          : HttpStatus.BAD_GATEWAY;

      throw new HttpException(message, status);
    }
  }
}
