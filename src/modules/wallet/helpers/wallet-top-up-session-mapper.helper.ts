import { WalletTopUpSession } from '@prisma/client';

import { WalletTopUpSessionResponseDto } from '../dtos/response/wallet.response';

export function mapWalletTopUpSession(
  session: WalletTopUpSession
): WalletTopUpSessionResponseDto {
  return {
    amount: Number(session.amount),
    checkoutUrl: session.checkoutUrl,
    completedAt: session.completedAt,
    createdAt: session.createdAt,
    currency: session.currency,
    expiresAt: session.expiresAt,
    failureReason: session.failureReason,
    id: session.id,
    paidAt: session.paidAt,
    paymentMethod: session.paymentMethod,
    phone: session.phone,
    reference: session.reference,
    status: session.status,
    updatedAt: session.updatedAt,
    userId: session.userId,
  };
}
