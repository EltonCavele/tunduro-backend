import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingCheckoutSessionStatus,
  BookingStatus,
  ParticipantStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { CourtService } from 'src/modules/court/services/court.service';
import { PaymentQueue } from 'src/modules/payment/queues/payment.queue';
import { BookingCheckoutFinalizerService } from 'src/modules/payment/services/booking-checkout-finalizer.service';
import { normalizeMozMsisdn } from 'src/modules/payment/utils/phone.util';
import { WalletService } from 'src/modules/wallet/services/wallet.service';

import {
  BookingCreateRequestDto,
  BookingExtendRequestDto,
} from '../dtos/request/booking.request';
import { BookingCheckoutSessionResponseDto } from '../dtos/response/booking.checkout.response';
import { BookingExtensionEligibilityDto } from '../dtos/response/booking.response';
import {
  BOOKING_EXTENSION_INTENT,
  EXTENSION_DURATION_MINUTES,
  EXTENSION_WINDOW_AFTER_MS,
  EXTENSION_WINDOW_BEFORE_MS,
} from '../constants/booking-extension.constants';
import {
  calculateBookingPrice,
  canRequestBookingLighting,
} from '../helpers/booking-pricing.helper';
import {
  isExtensionEndWithinCourtHours,
  resolveExtensionWindow,
} from '../helpers/booking-extension.helper';
import { mapCheckoutSession } from '../helpers/booking-mapper.helper';
import { BookingAvailabilityService } from './booking-availability.service';

const DEFAULT_PAYMENT_DEADLINE_MIN = 30;

@Injectable()
export class BookingCheckoutService {
  private readonly logger = new Logger(BookingCheckoutService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly courtService: CourtService,
    private readonly paymentQueue: PaymentQueue,
    private readonly checkoutFinalizer: BookingCheckoutFinalizerService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
    private readonly bookingAvailabilityService: BookingAvailabilityService
  ) {}

  async startCheckout(args: {
    organizerId: string;
    dto: BookingCreateRequestDto;
    metadata: Prisma.InputJsonValue | null;
  }): Promise<BookingCheckoutSessionResponseDto> {
    const { organizerId, dto, metadata } = args;
    const method = dto.paymentMethod ?? PaymentMethod.MPESA;
    this.assertSupportedCheckoutMethod(method);

    const msisdn =
      method === PaymentMethod.MPESA ? normalizeMozMsisdn(dto.phone) : null;
    if (method === PaymentMethod.MPESA && !msisdn) {
      throw new HttpException(
        'payment.error.invalidPhone',
        HttpStatus.BAD_REQUEST
      );
    }

    const court = await this.courtService.assertCourtIsBookable(dto.courtId);
    const organizer = await this.db.user.findUnique({
      where: { id: organizerId },
      select: { role: true },
    });
    if (!organizer) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const lightingRequested = dto.lightingRequested ?? false;
    if (lightingRequested && !canRequestBookingLighting(court)) {
      throw new HttpException(
        'booking.error.lightingUnavailable',
        HttpStatus.BAD_REQUEST
      );
    }

    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);

    if (Number.isNaN(duration) || duration <= 0) {
      throw new HttpException('booking.error.invalid', HttpStatus.BAD_REQUEST);
    }

    const participantCount =
      (dto.participantUserIds?.length ?? 0) +
      (dto.inviteEmails?.length ?? 0) +
      1;
    if (court.maxPlayers && participantCount > court.maxPlayers) {
      throw new HttpException(
        'booking.error.exceedsCourtCapacity',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.bookingAvailabilityService.assertAvailable(court.id, start, end);

    const amount = calculateBookingPrice({
      court,
      durationMinutes: duration,
      lightingRequested,
      organizerRole: organizer.role,
    });
    const reference = `TUNDURO-${randomUUID().slice(0, 8).toUpperCase()}`;
    const expiresAt = new Date(
      Date.now() + this.getPaymentDeadlineMin() * 60000
    );

    const session = await this.db.bookingCheckoutSession.create({
      data: {
        organizerId,
        courtId: court.id,
        startAt: start,
        endAt: end,
        durationMinutes: duration,
        amount,
        currency: court.currency,
        lightingRequested,
        reference,
        status: BookingCheckoutSessionStatus.OPEN,
        expiresAt,
        paymentMethod: method,
        phone: msisdn,
        participantUserIds: dto.participantUserIds
          ? (dto.participantUserIds as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        inviteEmails: dto.inviteEmails
          ? (dto.inviteEmails as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        metadata: metadata ?? Prisma.JsonNull,
      },
    });

    if (method === PaymentMethod.CLUB_BALANCE) {
      return this.completeBalanceCheckout(session);
    }

    await this.enqueueChargeOrDeleteSession(session.id);

    return mapCheckoutSession(session);
  }

  async startExtensionCheckout(
    user: IAuthUser,
    bookingId: string,
    dto: BookingExtendRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    const eligibility = await this.getExtensionEligibility(
      bookingId,
      user.userId
    );
    if (!eligibility.available) {
      const reason = eligibility.reason ?? 'booking.error.extensionUnavailable';
      throw new HttpException(reason, HttpStatus.CONFLICT);
    }

    const method = dto.paymentMethod ?? PaymentMethod.MPESA;
    this.assertSupportedCheckoutMethod(method);

    const msisdn =
      method === PaymentMethod.MPESA ? normalizeMozMsisdn(dto.phone) : null;
    if (method === PaymentMethod.MPESA && !msisdn) {
      throw new HttpException(
        'payment.error.invalidPhone',
        HttpStatus.BAD_REQUEST
      );
    }

    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
        organizer: { select: { role: true } },
      },
    });
    if (!booking?.court) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const { extensionStart, extensionEnd } = resolveExtensionWindow(
      booking.endAt,
      new Date()
    );

    await this.bookingAvailabilityService.assertAvailable(
      booking.courtId,
      extensionStart,
      extensionEnd,
      { excludeBookingId: booking.id }
    );

    const amount = calculateBookingPrice({
      court: booking.court,
      durationMinutes: EXTENSION_DURATION_MINUTES,
      lightingRequested: booking.lightingRequested,
      organizerRole: booking.organizer.role,
    });
    const reference = `TUNDURO-EXT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const expiresAt = new Date(
      Date.now() + this.getPaymentDeadlineMin() * 60000
    );

    const session = await this.db.bookingCheckoutSession.create({
      data: {
        organizerId: user.userId,
        courtId: booking.courtId,
        startAt: extensionStart,
        endAt: extensionEnd,
        durationMinutes: EXTENSION_DURATION_MINUTES,
        amount,
        currency: booking.court.currency,
        reference,
        status: BookingCheckoutSessionStatus.OPEN,
        expiresAt,
        paymentMethod: method,
        phone: msisdn,
        lightingRequested: booking.lightingRequested,
        metadata: {
          intent: BOOKING_EXTENSION_INTENT,
          targetBookingId: booking.id,
          requestedByUserId: user.userId,
        },
      },
    });

    if (method === PaymentMethod.CLUB_BALANCE) {
      return this.completeBalanceCheckout(session);
    }

    await this.enqueueChargeOrDeleteSession(session.id, true);

    return mapCheckoutSession(session);
  }

  async getExtensionEligibility(
    bookingId: string,
    userId?: string
  ): Promise<BookingExtensionEligibilityDto> {
    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
        organizer: { select: { role: true } },
        participants: true,
      },
    });

    if (!booking?.court) {
      return { available: false, reason: 'booking.error.notFound' };
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      return { available: false, reason: 'booking.error.extensionUnavailable' };
    }

    if (userId) {
      const isOrganizer = booking.organizerId === userId;
      const isAcceptedParticipant = booking.participants.some(
        p => p.userId === userId && p.status === ParticipantStatus.ACCEPTED
      );
      if (!isOrganizer && !isAcceptedParticipant) {
        return { available: false, reason: 'booking.error.extensionForbidden' };
      }
    }

    const now = new Date();
    const windowOpensAt = new Date(
      booking.endAt.getTime() - EXTENSION_WINDOW_BEFORE_MS
    );
    const windowClosesAt = new Date(
      booking.endAt.getTime() + EXTENSION_WINDOW_AFTER_MS
    );

    if (now < booking.startAt || now < windowOpensAt || now > windowClosesAt) {
      return {
        available: false,
        reason: 'booking.error.extensionNotInProgress',
      };
    }

    const hasPendingExtension = await this.hasPendingExtensionCheckout(
      booking.id
    );
    if (hasPendingExtension) {
      return {
        available: false,
        reason: 'booking.error.extensionPendingCheckout',
      };
    }

    const { extensionStart, extensionEnd } = resolveExtensionWindow(
      booking.endAt,
      now
    );

    if (!isExtensionEndWithinCourtHours(booking.court, extensionEnd)) {
      return {
        available: false,
        reason: 'booking.error.extensionOutsideHours',
      };
    }

    try {
      await this.bookingAvailabilityService.assertAvailable(
        booking.courtId,
        extensionStart,
        extensionEnd,
        { excludeBookingId: booking.id }
      );
    } catch {
      return {
        available: false,
        reason: 'booking.error.extensionSlotOccupied',
      };
    }

    const amount = calculateBookingPrice({
      court: booking.court,
      durationMinutes: EXTENSION_DURATION_MINUTES,
      lightingRequested: booking.lightingRequested,
      organizerRole: booking.organizer.role,
    });

    return {
      available: true,
      amount,
      newEndAt: extensionEnd,
    };
  }

  async getCheckoutSession(
    user: IAuthUser,
    sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new HttpException(
        'booking.error.checkoutSessionNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (!this.canAccessCheckoutSession(user, session)) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    return mapCheckoutSession(session);
  }

  async adminGetCheckoutSession(
    sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new HttpException(
        'booking.error.checkoutSessionNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    return mapCheckoutSession(session);
  }

  private assertSupportedCheckoutMethod(method: PaymentMethod): void {
    if (method === PaymentMethod.MPESA || method === PaymentMethod.CLUB_BALANCE) {
      return;
    }

    throw new HttpException(
      'payment.error.unsupportedMethod',
      HttpStatus.BAD_REQUEST
    );
  }

  private async enqueueChargeOrDeleteSession(sessionId: string, isExtension = false) {
    try {
      await this.paymentQueue.enqueueCharge(sessionId);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${
          isExtension ? 'extension ' : ''
        }charge for session ${sessionId}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
      await this.db.bookingCheckoutSession.delete({
        where: { id: sessionId },
      });
      throw new HttpException(
        'payment.error.gatewayUnavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  private async hasPendingExtensionCheckout(bookingId: string): Promise<boolean> {
    const now = new Date();
    const count = await this.db.bookingCheckoutSession.count({
      where: {
        status: {
          in: [
            BookingCheckoutSessionStatus.OPEN,
            BookingCheckoutSessionStatus.FINALIZING,
          ],
        },
        expiresAt: { gt: now },
        metadata: {
          path: ['intent'],
          equals: BOOKING_EXTENSION_INTENT,
        },
        AND: {
          metadata: {
            path: ['targetBookingId'],
            equals: bookingId,
          },
        },
      },
    });

    return count > 0;
  }

  private canAccessCheckoutSession(
    user: IAuthUser,
    session: {
      organizerId: string;
      metadata: Prisma.JsonValue;
    }
  ): boolean {
    if (session.organizerId === user.userId || user.role === 'ADMIN') {
      return true;
    }

    const metadata = session.metadata as Record<string, unknown> | null;
    if (
      metadata?.intent === BOOKING_EXTENSION_INTENT &&
      metadata?.requestedByUserId === user.userId
    ) {
      return true;
    }

    return false;
  }

  private async completeBalanceCheckout(
    session: any
  ): Promise<BookingCheckoutSessionResponseDto> {
    let completion:
      | Awaited<
          ReturnType<BookingCheckoutFinalizerService['applySuccessfulSession']>
        >
      | null = null;

    const result = {
      success: true,
      status: 'COMPLETED' as const,
      providerStatusCode: 'CLUB_BALANCE',
      providerMessage: 'Paid from club balance',
    };

    try {
      await this.db.$transaction(async tx => {
        await tx.bookingCheckoutSession.update({
          where: { id: session.id },
          data: { status: BookingCheckoutSessionStatus.FINALIZING },
        });

        completion = await this.checkoutFinalizer.applySuccessfulSession(
          tx,
          session,
          PaymentMethod.CLUB_BALANCE,
          result
        );

        await this.walletService.debitBookingBalance(tx, {
          userId: session.organizerId,
          amount: session.amount,
          bookingId: completion.bookingId,
          paymentReference: session.reference,
          note: 'Reserva paga com saldo do clube',
        });
      });
    } catch (error) {
      await this.db.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          status: BookingCheckoutSessionStatus.PAYMENT_FAILED,
          failureReason:
            error instanceof HttpException
              ? String(error.message)
              : 'club balance payment failed',
        },
      });
      throw error;
    }

    if (completion) {
      await this.checkoutFinalizer.dispatchCompletionSideEffects(completion);
    }

    const completed = await this.db.bookingCheckoutSession.findUnique({
      where: { id: session.id },
    });

    return mapCheckoutSession(completed ?? session);
  }

  private getPaymentDeadlineMin(): number {
    return (
      this.configService.get<number>('payment.paymentDeadlineMin') ??
      DEFAULT_PAYMENT_DEADLINE_MIN
    );
  }
}
