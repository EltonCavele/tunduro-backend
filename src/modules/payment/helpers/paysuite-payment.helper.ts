import { Prisma } from '@prisma/client';

interface PaysuiteMetadataUpdate {
  checkoutUrl?: string;
  event?: string;
  paymentId?: string;
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

export function extractPaysuitePaymentId(
  metadata: Prisma.JsonValue | null | undefined
): string | null {
  if (!isRecord(metadata) || !isRecord(metadata.paysuite)) {
    return null;
  }

  const paymentId = metadata.paysuite.paymentId;
  return typeof paymentId === 'string' && paymentId.trim()
    ? paymentId.trim()
    : null;
}

export function extractAppReturnUrl(
  metadata: Prisma.JsonValue | null | undefined
): string | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const appReturnUrl = metadata.appReturnUrl;
  return typeof appReturnUrl === 'string' && appReturnUrl.trim()
    ? appReturnUrl.trim()
    : null;
}

export function mergeAppReturnUrlMetadata(
  metadata: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  appReturnUrl: string | null | undefined
): Prisma.InputJsonValue {
  const base: Record<string, unknown> = isRecord(metadata)
    ? { ...metadata }
    : {};
  const cleanAppReturnUrl = appReturnUrl?.trim();

  if (cleanAppReturnUrl) {
    base.appReturnUrl = cleanAppReturnUrl;
  }

  return base as Prisma.InputJsonValue;
}

export function mergePaysuiteMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  update: PaysuiteMetadataUpdate
): Prisma.InputJsonValue {
  const base = isRecord(metadata) ? { ...metadata } : {};
  const currentPaysuite = isRecord(base.paysuite) ? base.paysuite : {};

  return {
    ...base,
    paysuite: cleanJsonObject({
      ...currentPaysuite,
      ...update,
    }),
  } as Prisma.InputJsonValue;
}
