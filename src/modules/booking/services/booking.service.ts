import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  BookingCheckoutSessionStatus,
  BookingStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  Role,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import {
  BookingAdminCancelRequestDto,
  BookingAdminCreateRequestDto,
  BookingAdminQueryRequestDto,
  BookingCancelRequestDto,
  BookingCreateRequestDto,
  BookingExtendRequestDto,
  BookingMeQueryRequestDto,
} from '../dtos/request/booking.request';
import { BookingCheckoutSessionResponseDto } from '../dtos/response/booking.checkout.response';
import {
  BookingExtensionEligibilityDto,
  BookingResponseDto,
} from '../dtos/response/booking.response';
import { bookingInclude, mapBooking } from '../helpers/booking-mapper.helper';
import { BookingCheckoutService } from './booking-checkout.service';
import { BookingInvitationService } from './booking-invitation.service';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly lightingOrchestratorService: LightingOrchestratorService,
    private readonly bookingNotifier: BookingNotifierService,
    private readonly checkoutService: BookingCheckoutService,
    private readonly invitationService: BookingInvitationService
  ) {}

  async createBooking(
    user: IAuthUser,
    dto: BookingCreateRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.checkoutService.startCheckout({
      organizerId: user.userId,
      dto,
      metadata: null,
    });
  }

  async adminCreateBooking(
    adminUser: IAuthUser,
    dto: BookingAdminCreateRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    const targetUser = await this.db.user.findUnique({
      where: { id: dto.userId },
    });
    if (!targetUser || targetUser.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    if (targetUser.suspendedAt) {
      throw new HttpException('user.error.userSuspended', HttpStatus.FORBIDDEN);
    }

    const session = await this.checkoutService.startCheckout({
      organizerId: dto.userId,
      dto: {
        courtId: dto.courtId,
        startAt: dto.startAt,
        endAt: dto.endAt,
        phone: dto.phone,
        paymentMethod: dto.paymentMethod,
        lightingRequested: dto.lightingRequested,
        participantUserIds: dto.participantUserIds,
        inviteEmails: dto.inviteEmails,
      },
      metadata: { createdByAdmin: adminUser.userId },
    });

    await this.bookingNotifier.notifyCheckoutCreatedByAdmin(session.id);

    return session;
  }

  async getCheckoutSession(
    user: IAuthUser,
    sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.checkoutService.getCheckoutSession(user, sessionId);
  }

  async adminGetCheckoutSession(
    sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.checkoutService.adminGetCheckoutSession(sessionId);
  }

  async startExtensionCheckout(
    user: IAuthUser,
    bookingId: string,
    dto: BookingExtendRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.checkoutService.startExtensionCheckout(user, bookingId, dto);
  }

  async getExtensionEligibility(
    bookingId: string,
    userId?: string
  ): Promise<BookingExtensionEligibilityDto> {
    return this.checkoutService.getExtensionEligibility(bookingId, userId);
  }

  async getMyBookings(
    userId: string,
    query: BookingMeQueryRequestDto
  ): Promise<ApiPaginatedDataDto<BookingResponseDto>> {
    const page = Math.max(1, query.page || 1);
    const take = Math.min(100, query.pageSize || 20);
    const where: Prisma.BookingWhereInput = {
      OR: [{ organizerId: userId }, { participants: { some: { userId } } }],
      ...(query.status ? { status: query.status as BookingStatus } : {}),
    };

    const [total, items] = await Promise.all([
      this.db.booking.count({ where }),
      this.db.booking.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: { startAt: 'desc' },
        include: bookingInclude(),
      }),
    ]);

    return {
      items: items.map(mapBooking),
      metadata: {
        currentPage: page,
        itemsPerPage: take,
        totalItems: total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getBookingForUser(
    user: IAuthUser,
    id: string
  ): Promise<BookingResponseDto> {
    const booking = await this.db.booking.findUnique({
      where: { id },
      include: bookingInclude(),
    });
    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const isMember = booking.participants.some(p => p.userId === user.userId);
    if (!isMember && booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    const extension = await this.getExtensionEligibility(id, user.userId);

    return { ...mapBooking(booking), extension };
  }

  async adminListBookings(
    query: BookingAdminQueryRequestDto
  ): Promise<ApiPaginatedDataDto<BookingResponseDto>> {
    const page = Math.max(1, query.page || 1);
    const take = Math.min(100, query.pageSize || 20);

    const where: Prisma.BookingWhereInput = {
      ...(query.status ? { status: query.status as BookingStatus } : {}),
      ...(query.courtId ? { courtId: query.courtId } : {}),
      ...(query.userId ? { organizerId: query.userId } : {}),
    };

    const [total, items] = await Promise.all([
      this.db.booking.count({ where }),
      this.db.booking.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: { startAt: 'desc' },
        include: bookingInclude(),
      }),
    ]);

    return {
      items: items.map(mapBooking),
      metadata: {
        currentPage: page,
        itemsPerPage: take,
        totalItems: total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async adminGetBooking(id: string): Promise<BookingResponseDto> {
    const booking = await this.db.booking.findUnique({
      where: { id },
      include: bookingInclude(),
    });
    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    return mapBooking(booking);
  }

  async adminCancelBooking(
    _admin: IAuthUser,
    id: string,
    dto: BookingAdminCancelRequestDto
  ): Promise<BookingResponseDto> {
    const booking = await this.db.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const reason = dto.reason || 'cancelled by admin';

    await this.db.$transaction(async tx => {
      await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });

      await tx.paymentTransaction.updateMany({
        where: {
          bookingId: id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
          type: PaymentType.BOOKING,
        },
        data: { status: PaymentStatus.CANCELLED },
      });
    });

    await this.deactivateLightsAfterCancellation(
      booking.checkedInAt,
      id,
      'admin_cancel_after_checkin'
    );
    await this.bookingNotifier.notifyBookingCancelledByAdmin(id, reason);

    return this.adminGetBooking(id);
  }

  async adminCheckIn(
    admin: IAuthUser,
    id: string
  ): Promise<BookingResponseDto> {
    const booking = await this.db.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException('booking.error.invalid', HttpStatus.BAD_REQUEST);
    }
    if (booking.checkedInAt) {
      return this.adminGetBooking(id);
    }

    await this.db.booking.update({
      where: { id },
      data: { checkedInAt: new Date(), checkInByUserId: admin.userId },
    });

    await this.activateLightsAfterCheckIn(id, admin.userId, 'admin check-in');
    await this.bookingNotifier.notifyCheckIn(id);

    return this.adminGetBooking(id);
  }

  async cancelBooking(
    user: IAuthUser,
    id: string,
    dto: BookingCancelRequestDto
  ): Promise<BookingResponseDto> {
    const booking = await this.db.booking.findUnique({ where: { id } });
    if (!booking || (booking.organizerId !== user.userId && user.role !== Role.ADMIN)) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    await this.db.$transaction(async tx => {
      await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: dto.reason || 'cancelled',
        },
      });

      await tx.paymentTransaction.updateMany({
        where: {
          bookingId: id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
          type: PaymentType.BOOKING,
        },
        data: { status: PaymentStatus.CANCELLED },
      });
    });

    await this.deactivateLightsAfterCancellation(
      booking.checkedInAt,
      id,
      'user_cancel_after_checkin'
    );

    return this.getBookingForUser(user, id);
  }

  async checkIn(user: IAuthUser, id: string): Promise<BookingResponseDto> {
    const booking = await this.db.booking.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!booking || booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException('booking.error.invalid', HttpStatus.BAD_REQUEST);
    }

    const isMember =
      booking.organizerId === user.userId ||
      booking.participants.some(p => p.userId === user.userId);
    if (!isMember && user.role !== Role.ADMIN) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }
    if (booking.checkedInAt) {
      return this.getBookingForUser(user, id);
    }

    await this.db.booking.update({
      where: { id },
      data: { checkedInAt: new Date(), checkInByUserId: user.userId },
    });

    await this.activateLightsAfterCheckIn(id, user.userId, 'user check-in');
    await this.bookingNotifier.notifyCheckIn(id);

    return this.getBookingForUser(user, id);
  }

  async expireOpenSessions(): Promise<number> {
    const now = new Date();
    const candidates = await this.db.bookingCheckoutSession.findMany({
      where: {
        status: {
          in: [
            BookingCheckoutSessionStatus.OPEN,
            BookingCheckoutSessionStatus.FINALIZING,
          ],
        },
        expiresAt: { lt: now },
      },
      select: { id: true },
    });

    let count = 0;
    for (const row of candidates) {
      await this.db.bookingCheckoutSession.update({
        where: { id: row.id },
        data: {
          status: BookingCheckoutSessionStatus.EXPIRED,
          failureReason: 'session timeout',
        },
      });

      await this.bookingNotifier.notifyCheckoutExpired(row.id);
      count += 1;
    }

    return count;
  }

  async dispatchUpcomingReminders(): Promise<{ start: number; end: number }> {
    const now = new Date();
    const lower = new Date(now.getTime() + 9 * 60_000);
    const upper = new Date(now.getTime() + 11 * 60_000);

    const startCandidates = await this.db.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startAt: { gte: lower, lte: upper },
        startReminderSentAt: null,
      },
      select: { id: true },
    });

    let startCount = 0;
    for (const booking of startCandidates) {
      try {
        await this.bookingNotifier.notifyBookingStartingSoon(booking.id);
        await this.db.booking.update({
          where: { id: booking.id },
          data: { startReminderSentAt: new Date() },
        });
        startCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to send start reminder for booking ${booking.id}: ${
            (error as Error)?.message ?? 'unknown'
          }`
        );
      }
    }

    const endCandidates = await this.db.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        endAt: { gte: lower, lte: upper },
        endReminderSentAt: null,
      },
      select: { id: true },
    });

    let endCount = 0;
    for (const booking of endCandidates) {
      try {
        const extensionEligibility = await this.getExtensionEligibility(
          booking.id
        );
        await this.bookingNotifier.notifyBookingEndingSoon(
          booking.id,
          extensionEligibility.available
        );
        await this.db.booking.update({
          where: { id: booking.id },
          data: { endReminderSentAt: new Date() },
        });
        endCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to send end reminder for booking ${booking.id}: ${
            (error as Error)?.message ?? 'unknown'
          }`
        );
      }
    }

    return { start: startCount, end: endCount };
  }

  async respondToInvitationAsUser(
    userId: string,
    bookingId: string,
    accept: boolean
  ): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    return this.invitationService.respondToInvitationAsUser(
      userId,
      bookingId,
      accept
    );
  }

  async respondToInvitationByToken(
    user: IAuthUser,
    token: string,
    accept: boolean
  ): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    return this.invitationService.respondToInvitationByToken(
      user,
      token,
      accept
    );
  }

  async getInvitationByToken(
    user: IAuthUser,
    token: string
  ): Promise<{
    invitation: {
      id: string;
      status: string;
      expiresAt: Date;
      respondedAt: Date | null;
      inviteeEmail: string | null;
      invitedUserId: string | null;
    };
    booking: BookingResponseDto;
  }> {
    return this.invitationService.getInvitationByToken(user, token);
  }

  private async deactivateLightsAfterCancellation(
    checkedInAt: Date | null,
    bookingId: string,
    reason: string
  ) {
    if (!checkedInAt) {
      return;
    }

    try {
      await this.lightingOrchestratorService.deactivateNow(bookingId, reason);
    } catch (error: any) {
      this.logger.warn(
        `Failed to deactivate lights after cancel for booking ${bookingId}: ${
          error?.message ?? 'unknown error'
        }`
      );
    }
  }

  private async activateLightsAfterCheckIn(
    bookingId: string,
    userId: string,
    action: string
  ) {
    try {
      await this.lightingOrchestratorService.activateByCheckIn(
        bookingId,
        userId
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to activate lights on ${action} for booking ${bookingId}: ${
          error?.message ?? 'unknown error'
        }`
      );
    }
  }
}
