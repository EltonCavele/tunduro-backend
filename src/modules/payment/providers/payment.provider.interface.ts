import { PaymentMethod } from '@prisma/client';

export interface ChargeInput {
  amount: number;
  currency: string;
  description?: string;
  method: PaymentMethod;
  phone?: string;
  reference: string;
  sessionId?: string;
  thirdPartyRef: string;
}

export type ChargeOutcomeStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface ChargeResult {
  checkoutUrl?: string;
  providerPaymentId?: string;
  providerPayload?: Record<string, unknown>;
  success: boolean;
  status: ChargeOutcomeStatus;
  providerTransactionId?: string;
  providerStatusCode: string;
  providerMessage: string;
}

export interface PaymentStatusInput {
  providerPaymentId?: string;
  providerTransactionId?: string;
  reference: string;
}

export interface IPaymentProvider {
  readonly method: PaymentMethod;
  charge(input: ChargeInput): Promise<ChargeResult>;
  getStatus?(input: PaymentStatusInput): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER_TOKEN = 'PAYMENT_PROVIDER_TOKEN';
