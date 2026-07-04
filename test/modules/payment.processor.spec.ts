import {
  BookingCheckoutSessionStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

import { PaymentProcessor } from 'src/modules/payment/queues/payment.processor';

describe('PaymentProcessor', () => {
  it('creates a pending Zenofy payment for card booking checkout', async () => {
    const session = {
      amount: new Prisma.Decimal(1000),
      bookingId: null,
      checkoutUrl: null,
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
      metadata: null,
      organizer: {
        email: 'client@example.com',
        firstName: 'Cliente',
        lastName: 'Teste',
        phone: '+258841234567',
      },
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
    const updatedSession = {
      ...session,
      checkoutUrl: 'https://pay.zenofy.io/o/order-1',
      metadata: { zenofy: { paymentId: 'order-1' } },
    };
    const db = {
      bookingCheckoutSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue(updatedSession),
      },
    };
    const provider = {
      charge: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://pay.zenofy.io/o/order-1',
        providerMessage: 'Zenofy order created',
        providerPaymentId: 'order-1',
        providerStatusCode: 'PENDING',
        providerTransactionId: 'order-1',
        status: 'PENDING',
        success: true,
      }),
    };
    const providerFactory = {
      getProvider: jest.fn().mockReturnValue(provider),
    };
    const paymentTransactions = {
      markCheckoutFailed: jest.fn(),
      markCheckoutPending: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new PaymentProcessor(
      db as any,
      providerFactory as any,
      { completeSuccessfulSession: jest.fn() } as any,
      paymentTransactions as any,
      { notifyCheckoutFailed: jest.fn() } as any
    );

    await processor.handleCharge({ data: { sessionId: 'session-1' } } as any);

    expect(providerFactory.getProvider).toHaveBeenCalledWith(
      PaymentMethod.CARD
    );
    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'client@example.com',
        customerName: 'Cliente Teste',
        method: PaymentMethod.CARD,
        phone: '+258841234567',
      })
    );
    expect(db.bookingCheckoutSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        checkoutUrl: 'https://pay.zenofy.io/o/order-1',
        metadata: expect.objectContaining({
          zenofy: expect.objectContaining({
            orderId: 'order-1',
            paymentId: 'order-1',
            status: 'PENDING',
          }),
        }),
      }),
    });
    expect(paymentTransactions.markCheckoutPending).toHaveBeenCalledWith(
      updatedSession,
      PaymentMethod.CARD,
      expect.objectContaining({ status: 'PENDING' })
    );
  });
});
