import { createHmac } from 'crypto';
import {
  BookingCheckoutSessionStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

import { ZenofyWebhookService } from 'src/modules/payment/services/zenofy-webhook.service';

describe('ZenofyWebhookService', () => {
  const session = {
    amount: new Prisma.Decimal(1000),
    bookingId: null,
    checkoutUrl: 'https://pay.zenofy.io/o/order-1',
    completedAt: null,
    courtId: 'court-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    currency: 'MZN',
    durationMinutes: 60,
    endAt: new Date('2026-01-01T11:00:00Z'),
    expiresAt: new Date('2026-01-01T10:30:00Z'),
    failureReason: null,
    id: 'session-1',
    inviteEmails: null,
    lightingRequested: false,
    metadata: { zenofy: { paymentId: 'checkout-1' } },
    organizerId: 'user-1',
    paidAt: null,
    participantUserIds: null,
    paymentMethod: PaymentMethod.CARD,
    phone: '+258841234567',
    reference: 'TUNDUROABC123',
    refundedAt: null,
    refundId: null,
    startAt: new Date('2026-01-01T10:00:00Z'),
    status: BookingCheckoutSessionStatus.OPEN,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  function createService() {
    const db = {
      bookingCheckoutSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          checkoutSession: session,
          checkoutSessionId: session.id,
        }),
      },
    };
    const checkoutFinalizer = {
      completeSuccessfulSession: jest.fn().mockResolvedValue({
        bookingId: 'booking-1',
        createdInvitationIds: [],
        isExtension: false,
      }),
    };
    const paymentTransactions = {
      markCheckoutCancelled: jest.fn().mockResolvedValue(undefined),
    };
    const bookingNotifier = {
      notifyCheckoutFailed: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ZenofyWebhookService(
      { get: jest.fn((key: string) => (key === 'payment.zenofy.webhookSecret' ? 'secret-1' : undefined)) } as any,
      db as any,
      checkoutFinalizer as any,
      paymentTransactions as any,
      bookingNotifier as any
    );

    return {
      bookingNotifier,
      checkoutFinalizer,
      db,
      paymentTransactions,
      service,
    };
  }

  it('validates the HMAC webhook signature', () => {
    const { service } = createService();
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');
    const signature = `sha256=${createHmac('sha256', 'secret-1')
      .update(rawBody)
      .digest('hex')}`;

    expect(service.verifySignature(rawBody, signature)).toBe(true);
    expect(service.verifySignature(rawBody, 'sha256=wrong')).toBe(false);
  });

  it('completes a booking checkout when Zenofy sends payment.succeeded', async () => {
    const { checkoutFinalizer, db, service } = createService();

    await service.handleWebhook({
      checkout_id: 'checkout-1',
      event: 'payment.succeeded',
      payment_id: 'pay-1',
      reference: 'TUNDUROABC123',
      status: 'succeeded',
    });

    expect(db.paymentTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          method: PaymentMethod.CARD,
          providerTransactionId: 'checkout-1',
        }),
      })
    );
    expect(db.bookingCheckoutSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          zenofy: expect.objectContaining({
            orderId: 'checkout-1',
            paymentReference: 'pay-1',
            status: 'succeeded',
          }),
        }),
      }),
    });
    expect(checkoutFinalizer.completeSuccessfulSession).toHaveBeenCalledWith(
      session,
      PaymentMethod.CARD,
      expect.objectContaining({ status: 'COMPLETED' })
    );
  });

  it('cancels a pending checkout when Zenofy sends payment.refunded', async () => {
    const { bookingNotifier, db, paymentTransactions, service } =
      createService();

    await service.handleWebhook({
      checkout_id: 'checkout-1',
      event: 'payment.refunded',
      payment_id: 'pay-1',
      status: 'refunded',
    });

    expect(db.bookingCheckoutSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: BookingCheckoutSessionStatus.OPEN,
      },
      data: expect.objectContaining({
        status: BookingCheckoutSessionStatus.PAYMENT_FAILED,
      }),
    });
    expect(paymentTransactions.markCheckoutCancelled).toHaveBeenCalledWith(
      session,
      PaymentMethod.CARD,
      'Zenofy payment refunded',
      'refunded'
    );
    expect(bookingNotifier.notifyCheckoutFailed).toHaveBeenCalledWith(
      'session-1',
      'Zenofy payment refunded'
    );
  });
});
