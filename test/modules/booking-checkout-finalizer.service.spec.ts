import {
  BookingCheckoutSessionStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

import { BookingCheckoutFinalizerService } from 'src/modules/payment/services/booking-checkout-finalizer.service';
import { PaymentTransactionStateService } from 'src/modules/payment/services/payment-transaction-state.service';

describe('BookingCheckoutFinalizerService', () => {
  const session = {
    id: 'session-1',
    organizerId: 'user-1',
    courtId: 'court-1',
    bookingId: null,
    startAt: new Date('2026-07-03T10:00:00Z'),
    endAt: new Date('2026-07-03T11:00:00Z'),
    durationMinutes: 60,
    amount: new Prisma.Decimal(1000),
    currency: 'MZN',
    reference: 'TUNDUROABC123',
    participantUserIds: null,
    inviteEmails: null,
    status: BookingCheckoutSessionStatus.OPEN,
    expiresAt: new Date('2026-07-03T09:30:00Z'),
    checkoutUrl: null,
    paymentMethod: PaymentMethod.MPESA,
    phone: null,
    refundId: null,
    failureReason: null,
    paidAt: null,
    completedAt: null,
    refundedAt: null,
    lightingRequested: false,
    metadata: null,
    createdAt: new Date('2026-07-03T09:00:00Z'),
    updatedAt: new Date('2026-07-03T09:00:00Z'),
  };

  const result = {
    success: true,
    status: 'COMPLETED' as const,
    providerStatusCode: 'paid',
    providerMessage: 'Payment confirmed',
    providerTransactionId: 'provider-tx-1',
  };

  it('marks paid checkout as refund pending when another payment already won the slot', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      booking: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
      },
      bookingCheckoutSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentTransaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
    };
    const db = {
      $transaction: jest.fn(async callback => callback(tx)),
    };
    const notifier = {
      notifyPaymentConfirmed: jest.fn(),
      notifyInvitationCreated: jest.fn(),
      notifyBookingExtended: jest.fn(),
    };
    const lighting = {
      activateByCheckIn: jest.fn(),
    };

    const service = new BookingCheckoutFinalizerService(
      db as any,
      notifier as any,
      lighting as any,
      new PaymentTransactionStateService({} as any)
    );

    const completion = await service.completeSuccessfulSession(
      session as any,
      PaymentMethod.MPESA,
      result
    );

    expect(completion.bookingId).toBeNull();
    expect(tx.booking.create).not.toHaveBeenCalled();
    expect(tx.paymentTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: null,
        checkoutSessionId: 'session-1',
        status: 'COMPLETED',
      }),
    });
    expect(tx.bookingCheckoutSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        status: BookingCheckoutSessionStatus.REFUND_PENDING,
        failureReason: 'booking.error.conflict',
      }),
    });
    expect(notifier.notifyPaymentConfirmed).not.toHaveBeenCalled();
  });
});
