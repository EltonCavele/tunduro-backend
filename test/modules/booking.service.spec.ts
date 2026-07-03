import {
  BookingCheckoutSessionStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

import { BookingService } from 'src/modules/booking/services/booking.service';

describe('BookingService', () => {
  function createService() {
    const checkoutSession = {
      amount: new Prisma.Decimal(1000),
      bookingId: null,
      checkoutUrl: 'https://paysuite.test/checkout/1',
      completedAt: null,
      courtId: 'court-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      currency: 'MZN',
      durationMinutes: 60,
      endAt: new Date('2026-01-01T11:00:00Z'),
      expiresAt: new Date('2026-01-01T00:30:00Z'),
      failureReason: null,
      id: 'checkout-session-1',
      lightingRequested: false,
      metadata: null,
      organizerId: 'user-1',
      paidAt: null,
      paymentMethod: PaymentMethod.MPESA,
      phone: null,
      providerMessage: null,
      providerPaymentId: 'pay-1',
      providerStatusCode: 'pending',
      providerTransactionId: null,
      reference: 'TUNDUROBOOKINGABC12345',
      refundedAt: null,
      startAt: new Date('2026-01-01T10:00:00Z'),
      status: BookingCheckoutSessionStatus.OPEN,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const db = {
      bookingCheckoutSession: {
        findMany: jest.fn().mockResolvedValue([checkoutSession]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const bookingNotifier = {
      notifyCheckoutExpired: jest.fn().mockResolvedValue(undefined),
    };
    const paymentTransactions = {
      markCheckoutCancelled: jest.fn().mockResolvedValue(undefined),
    };

    return {
      bookingNotifier,
      db,
      paymentTransactions,
      service: new BookingService(
        db as any,
        {} as any,
        bookingNotifier as any,
        {} as any,
        {} as any,
        {} as any,
        paymentTransactions as any
      ),
    };
  }

  it('marks pending checkout payments as cancelled when sessions expire', async () => {
    const { bookingNotifier, db, paymentTransactions, service } = createService();

    await expect(service.expireOpenSessions()).resolves.toBe(1);

    expect(db.bookingCheckoutSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'checkout-session-1',
        status: {
          in: [
            BookingCheckoutSessionStatus.OPEN,
            BookingCheckoutSessionStatus.FINALIZING,
          ],
        },
      },
      data: {
        status: BookingCheckoutSessionStatus.EXPIRED,
        failureReason: 'session timeout',
      },
    });
    expect(paymentTransactions.markCheckoutCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'checkout-session-1' }),
      PaymentMethod.MPESA,
      'session timeout',
      'expired'
    );
    expect(bookingNotifier.notifyCheckoutExpired).toHaveBeenCalledWith(
      'checkout-session-1'
    );
  });
});
