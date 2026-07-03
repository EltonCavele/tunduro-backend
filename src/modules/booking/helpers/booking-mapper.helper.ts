import { BookingCheckoutSessionStatus, Prisma } from '@prisma/client';

import { BookingCheckoutSessionResponseDto } from '../dtos/response/booking.checkout.response';
import { BookingResponseDto } from '../dtos/response/booking.response';
import { BOOKING_EXTENSION_INTENT } from '../constants/booking-extension.constants';

export function bookingInclude() {
  return {
    participants: true,
    payments: true,
    statusHistory: { orderBy: { createdAt: 'desc' as const } },
  };
}

export function mapBooking(booking: any): BookingResponseDto {
  return {
    ...booking,
    totalPrice: Number(booking.totalPrice),
    paidAmount: Number(booking.paidAmount),
    participants: booking.participants || [],
    payments: booking.payments || [],
    statusHistory: booking.statusHistory || [],
  };
}

export function resolveCheckoutSessionBookingId(session: {
  bookingId: string | null;
  metadata: Prisma.JsonValue;
  status: BookingCheckoutSessionStatus;
}): string | null {
  if (session.bookingId) {
    return session.bookingId;
  }

  const metadata = session.metadata as Record<string, unknown> | null;
  if (
    session.status === BookingCheckoutSessionStatus.COMPLETED &&
    metadata?.intent === BOOKING_EXTENSION_INTENT &&
    typeof metadata?.targetBookingId === 'string'
  ) {
    return metadata.targetBookingId;
  }

  return null;
}

export function mapCheckoutSession(
  session: any
): BookingCheckoutSessionResponseDto {
  return {
    id: session.id,
    status: session.status,
    bookingId: resolveCheckoutSessionBookingId(session),
    organizerId: session.organizerId,
    courtId: session.courtId,
    startAt: session.startAt,
    endAt: session.endAt,
    durationMinutes: session.durationMinutes,
    amount: Number(session.amount),
    lightingRequested: Boolean(session.lightingRequested),
    currency: session.currency,
    reference: session.reference,
    paymentMethod: session.paymentMethod,
    phone: maskPhone(session.phone),
    checkoutUrl: session.checkoutUrl,
    failureReason: session.failureReason,
    expiresAt: session.expiresAt,
    paidAt: session.paidAt,
    completedAt: session.completedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 4) return `*** ${phone}`;
  return `*** ${phone.slice(-4)}`;
}
