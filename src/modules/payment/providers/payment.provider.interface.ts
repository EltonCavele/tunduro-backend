import { PaymentMethod } from '@prisma/client';

export interface ChargeInput {
  amount: number;
  currency: string;
  phone?: string;
  reference: string;
  thirdPartyRef: string;
}

export type ChargeOutcomeStatus = 'COMPLETED' | 'FAILED';

export interface ChargeResult {
  success: boolean;
  status: ChargeOutcomeStatus;
  providerTransactionId?: string;
  providerStatusCode: string;
  providerMessage: string;
}

export interface IPaymentProvider {
  readonly method: PaymentMethod;
  charge(input: ChargeInput): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER_TOKEN = 'PAYMENT_PROVIDER_TOKEN';
