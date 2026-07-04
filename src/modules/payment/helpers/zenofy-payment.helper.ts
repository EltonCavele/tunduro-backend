import { PaymentMethod, Prisma } from '@prisma/client';

import { normalizeMozMsisdn } from '../utils/phone.util';

interface ProviderMetadataUpdate {
  checkoutUrl?: string;
  event?: string;
  orderId?: string;
  paymentId?: string;
  paymentReference?: string | null;
  requestId?: string;
  status?: string;
  transactionId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanJsonObject(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function providerMetadataKey(method: PaymentMethod): 'paysuite' | 'zenofy' {
  return method === PaymentMethod.CARD ? 'zenofy' : 'paysuite';
}

export function extractProviderPaymentId(
  metadata: Prisma.JsonValue | null | undefined,
  method: PaymentMethod
): string | null {
  const key = providerMetadataKey(method);
  if (!isRecord(metadata) || !isRecord(metadata[key])) {
    return null;
  }

  const paymentId = metadata[key].paymentId ?? metadata[key].orderId;
  return typeof paymentId === 'string' && paymentId.trim()
    ? paymentId.trim()
    : null;
}

export function mergeProviderPaymentMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  method: PaymentMethod,
  update: ProviderMetadataUpdate
): Prisma.InputJsonValue {
  const key = providerMetadataKey(method);
  const base = isRecord(metadata) ? { ...metadata } : {};
  const current = isRecord(base[key]) ? base[key] : {};

  return {
    ...base,
    [key]: cleanJsonObject({
      ...current,
      ...update,
    }),
  } as Prisma.InputJsonValue;
}

export function normalizeZenofyPhoneNumber(
  input: string | undefined | null
): string | null {
  if (!input) return null;

  const compact = String(input).replace(/[\s().-]/g, '');
  if (/^\+\d{7,15}$/.test(compact)) {
    return compact;
  }

  const mozMsisdn = normalizeMozMsisdn(input);
  if (mozMsisdn) {
    return `+${mozMsisdn}`;
  }

  const digits = String(input).replace(/[^\d]/g, '');
  if (/^\d{7,15}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}
