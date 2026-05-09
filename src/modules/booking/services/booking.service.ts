import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingCheckoutSessionStatus,
  BookingStatus,
  InvitationStatus,
  ParticipantStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
  Role,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';
import { CourtService } from 'src/modules/court/services/court.service';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';
import { PaymentQueue } from 'src/modules/payment/queues/payment.queue';
import { normalizeMozMsisdn } from 'src/modules/payment/utils/phone.util';

import {
  BookingAdminCancelRequestDto,
  BookingAdminCreateRequestDto,
  BookingAdminQueryRequestDto,
  BookingCancelRequestDto,
  BookingCreateRequestDto,
  BookingMeQueryRequestDto,
} from '../dtos/request/booking.request';
import { BookingCheckoutSessionResponseDto } from '../dtos/response/booking.checkout.response';
import { BookingResponseDto } from '../dtos/response/booking.response';

const DEFAULT_PAYMENT_DEADLINE_MIN = 30;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly courtService: CourtService,
    private readonly lightingOrchestratorService: LightingOrchestratorService,
    private readonly paymentQueue: PaymentQueue,
    private readonly bookingNotifier: BookingNotifierService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Inicia um checkout: cria uma BookingCheckoutSession OPEN (que segura o
   * slot) e enfileira o débito M-Pesa. O Booking só nasce após o pagamento
   * confirmar. O cliente faz polling em GET /bookings/checkout/:sessionId.
   */
  async createBooking(
    user: IAuthUser,
    dto: BookingCreateRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.startCheckout({
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

    const session = await this.startCheckout({
      organizerId: dto.userId,
      dto: {
        courtId: dto.courtId,
        startAt: dto.startAt,
        endAt: dto.endAt,
        phone: dto.phone,
        paymentMethod: dto.paymentMethod,
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
    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new HttpException(
        'booking.error.checkoutSessionNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (session.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    return this.mapSession(session);
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
    return this.mapSession(session);
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
        include: this.inc(),
      }),
    ]);

    return {
      items: items.map(b => this.map(b)),
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
      include: this.inc(),
    });
    if (!booking)
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);

    const isMember = booking.participants.some(p => p.userId === user.userId);
    if (!isMember && user.role !== Role.ADMIN)
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);

    return this.map(booking);
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
        include: this.inc(),
      }),
    ]);

    return {
      items: items.map(b => this.map(b)),
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
      include: this.inc(),
    });
    if (!booking)
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);

    return this.map(booking);
  }

  async adminCancelBooking(
    _admin: IAuthUser,
    id: string,
    dto: BookingAdminCancelRequestDto
  ): Promise<BookingResponseDto> {
    const b = await this.db.booking.findUnique({ where: { id } });
    if (!b)
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);

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

    if (b.checkedInAt) {
      try {
        await this.lightingOrchestratorService.deactivateNow(
          id,
          'admin_cancel_after_checkin'
        );
      } catch (error: any) {
        this.logger.warn(
          `Failed to deactivate lights after admin cancel for booking ${id}: ${
            error?.message ?? 'unknown error'
          }`
        );
      }
    }

    await this.bookingNotifier.notifyBookingCancelledByAdmin(id, reason);

    return this.adminGetBooking(id);
  }

  async adminCheckIn(
    admin: IAuthUser,
    id: string
  ): Promise<BookingResponseDto> {
    const b = await this.db.booking.findUnique({ where: { id } });
    if (!b)
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    if (b.status !== BookingStatus.CONFIRMED)
      throw new HttpException('booking.error.invalid', HttpStatus.BAD_REQUEST);
    if (b.checkedInAt) {
      return this.adminGetBooking(id);
    }

    await this.db.booking.update({
      where: { id },
      data: { checkedInAt: new Date(), checkInByUserId: admin.userId },
    });

    try {
      await this.lightingOrchestratorService.activateByCheckIn(id, admin.userId);
    } catch (error: any) {
      this.logger.warn(
        `Failed to activate lights on admin check-in for booking ${id}: ${
          error?.message ?? 'unknown error'
        }`
      );
    }

    await this.bookingNotifier.notifyCheckIn(id);

    return this.adminGetBooking(id);
  }

  async cancelBooking(
    user: IAuthUser,
    id: string,
    dto: BookingCancelRequestDto
  ): Promise<BookingResponseDto> {
    const b = await this.db.booking.findUnique({ where: { id } });
    if (!b || (b.organizerId !== user.userId && user.role !== Role.ADMIN))
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);

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

    if (b.checkedInAt) {
      try {
        await this.lightingOrchestratorService.deactivateNow(
          id,
          'user_cancel_after_checkin'
        );
      } catch (error: any) {
        this.logger.warn(
          `Failed to deactivate lights after user cancel for booking ${id}: ${
            error?.message ?? 'unknown error'
          }`
        );
      }
    }

    return this.getBookingForUser(user, id);
  }

  async checkIn(user: IAuthUser, id: string): Promise<BookingResponseDto> {
    const b = await this.db.booking.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!b || b.status !== BookingStatus.CONFIRMED)
      throw new HttpException('booking.error.invalid', HttpStatus.BAD_REQUEST);

    const isMember =
      b.organizerId === user.userId ||
      b.participants.some(p => p.userId === user.userId);
    if (!isMember && user.role !== Role.ADMIN)
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    if (b.checkedInAt) {
      return this.getBookingForUser(user, id);
    }

    await this.db.booking.update({
      where: { id },
      data: { checkedInAt: new Date(), checkInByUserId: user.userId },
    });

    try {
      await this.lightingOrchestratorService.activateByCheckIn(id, user.userId);
    } catch (error: any) {
      this.logger.warn(
        `Failed to activate lights on check-in for booking ${id}: ${
          error?.message ?? 'unknown error'
        }`
      );
    }

    await this.bookingNotifier.notifyCheckIn(id);

    return this.getBookingForUser(user, id);
  }

  /**
   * Cron: marca como EXPIRED qualquer BookingCheckoutSession ainda OPEN ou
   * FINALIZING cuja expiresAt já passou. Liberta o slot e notifica o organizador.
   */
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

  /**
   * Cron: dispara push/email para reservas CONFIRMED cuja janela de 10min
   * antes de start/end caiu na janela de 9-11min (tolerância para atraso do
   * cron). Marca *ReminderSentAt para garantir idempotência.
   */
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
    for (const b of startCandidates) {
      try {
        await this.bookingNotifier.notifyBookingStartingSoon(b.id);
        await this.db.booking.update({
          where: { id: b.id },
          data: { startReminderSentAt: new Date() },
        });
        startCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to send start reminder for booking ${b.id}: ${
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
    for (const b of endCandidates) {
      try {
        await this.bookingNotifier.notifyBookingEndingSoon(b.id);
        await this.db.booking.update({
          where: { id: b.id },
          data: { endReminderSentAt: new Date() },
        });
        endCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to send end reminder for booking ${b.id}: ${
            (error as Error)?.message ?? 'unknown'
          }`
        );
      }
    }

    return { start: startCount, end: endCount };
  }

  /**
   * Permite a um user registado responder a um convite no qual já é
   * BookingParticipant INVITED. Se aceitar passa a ACCEPTED, se recusar
   * passa a DECLINED. Marca também a BookingInvitation correspondente.
   */
  async respondToInvitationAsUser(
    userId: string,
    bookingId: string,
    accept: boolean
  ): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, startAt: true },
    });
    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException('booking.error.invalid', HttpStatus.CONFLICT);
    }

    const participant = await this.db.bookingParticipant.findUnique({
      where: { bookingId_userId: { bookingId, userId } },
    });
    if (!participant) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }
    if (participant.status !== ParticipantStatus.INVITED) {
      throw new HttpException(
        'booking.error.invitationAlreadyHandled',
        HttpStatus.CONFLICT
      );
    }

    const invitation = await this.db.bookingInvitation.findFirst({
      where: {
        bookingId,
        invitedUserId: userId,
        status: InvitationStatus.PENDING,
      },
    });
    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new HttpException(
        'booking.error.invitationExpired',
        HttpStatus.GONE
      );
    }

    return this.applyInvitationResponse({
      bookingId,
      userId,
      invitationId: invitation.id,
      hasParticipant: true,
      accept,
    });
  }

  /**
   * Permite responder a um convite via token (geralmente vindo de um email
   * para alguém que ainda não tinha participant criado, ou um deep link).
   * Exige user autenticado; valida que o user corresponde ao destinatário
   * (id ou email do convite).
   */
  async respondToInvitationByToken(
    user: IAuthUser,
    token: string,
    accept: boolean
  ): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    const invitation = await this.db.bookingInvitation.findUnique({
      where: { token },
      include: {
        booking: { select: { id: true, status: true, startAt: true } },
      },
    });
    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new HttpException(
        'booking.error.invitationAlreadyHandled',
        HttpStatus.CONFLICT
      );
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new HttpException(
        'booking.error.invitationExpired',
        HttpStatus.GONE
      );
    }
    if (invitation.booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException('booking.error.invalid', HttpStatus.CONFLICT);
    }

    if (
      invitation.invitedUserId &&
      invitation.invitedUserId !== user.userId
    ) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    if (!invitation.invitedUserId && invitation.inviteeEmail) {
      const me = await this.db.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
      });
      if (
        !me ||
        me.email.trim().toLowerCase() !==
          invitation.inviteeEmail.trim().toLowerCase()
      ) {
        throw new HttpException(
          'booking.error.invitationEmailMismatch',
          HttpStatus.FORBIDDEN
        );
      }
    }

    const existingParticipant = await this.db.bookingParticipant.findUnique({
      where: {
        bookingId_userId: { bookingId: invitation.bookingId, userId: user.userId },
      },
    });

    return this.applyInvitationResponse({
      bookingId: invitation.bookingId,
      userId: user.userId,
      invitationId: invitation.id,
      hasParticipant: Boolean(existingParticipant),
      accept,
      linkInvitedUserId: !invitation.invitedUserId,
    });
  }

  /**
   * Devolve um preview do convite para o app mobile mostrar antes do user
   * confirmar. Exige autenticação. O preview revela court, datas, organizer
   * e expiry. Não valida ownership de email aqui (o respond fará isso).
   */
  async getInvitationByToken(
    user: IAuthUser,
    token: string
  ): Promise<{
    invitation: {
      id: string;
      status: InvitationStatus;
      expiresAt: Date;
      respondedAt: Date | null;
      inviteeEmail: string | null;
      invitedUserId: string | null;
    };
    booking: BookingResponseDto;
  }> {
    const invitation = await this.db.bookingInvitation.findUnique({
      where: { token },
      include: {
        booking: { include: this.inc() },
      },
    });
    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    void user;

    return {
      invitation: {
        id: invitation.id,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        respondedAt: invitation.respondedAt,
        inviteeEmail: invitation.inviteeEmail,
        invitedUserId: invitation.invitedUserId,
      },
      booking: this.map(invitation.booking),
    };
  }

  private async applyInvitationResponse(args: {
    bookingId: string;
    userId: string;
    invitationId: string;
    hasParticipant: boolean;
    accept: boolean;
    linkInvitedUserId?: boolean;
  }): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    const targetParticipantStatus = args.accept
      ? ParticipantStatus.ACCEPTED
      : ParticipantStatus.DECLINED;
    const targetInvitationStatus = args.accept
      ? InvitationStatus.ACCEPTED
      : InvitationStatus.DECLINED;
    const now = new Date();

    await this.db.$transaction(async tx => {
      if (args.hasParticipant) {
        await tx.bookingParticipant.update({
          where: {
            bookingId_userId: {
              bookingId: args.bookingId,
              userId: args.userId,
            },
          },
          data: { status: targetParticipantStatus },
        });
      } else if (args.accept) {
        await tx.bookingParticipant.create({
          data: {
            bookingId: args.bookingId,
            userId: args.userId,
            status: ParticipantStatus.ACCEPTED,
            isOrganizer: false,
          },
        });
      }

      await tx.bookingInvitation.update({
        where: { id: args.invitationId },
        data: {
          status: targetInvitationStatus,
          respondedAt: now,
          ...(args.linkInvitedUserId ? { invitedUserId: args.userId } : {}),
        },
      });
    });

    await this.bookingNotifier.notifyInvitationResponded(
      args.invitationId,
      args.accept
    );

    return {
      bookingId: args.bookingId,
      invitationId: args.invitationId,
      status: targetParticipantStatus,
    };
  }

  private async startCheckout(args: {
    organizerId: string;
    dto: BookingCreateRequestDto;
    metadata: Prisma.InputJsonValue | null;
  }): Promise<BookingCheckoutSessionResponseDto> {
    const { organizerId, dto, metadata } = args;
    const method = dto.paymentMethod ?? PaymentMethod.MPESA;

    const msisdn = normalizeMozMsisdn(dto.phone);
    if (!msisdn) {
      throw new HttpException(
        'payment.error.invalidPhone',
        HttpStatus.BAD_REQUEST
      );
    }

    const court = await this.courtService.assertCourtIsBookable(dto.courtId);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);

    if (Number.isNaN(duration) || duration <= 0) {
      throw new HttpException('booking.error.invalid', HttpStatus.BAD_REQUEST);
    }

    await this.assertAvailable(court.id, start, end);

    const amount = Number(
      (Number(court.pricePerHour) * (duration / 60)).toFixed(2)
    );
    const reference = `PAY-${randomUUID().slice(0, 8).toUpperCase()}`;
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

    try {
      await this.paymentQueue.enqueueCharge(session.id);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue charge for session ${session.id}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
      await this.db.bookingCheckoutSession.delete({ where: { id: session.id } });
      throw new HttpException(
        'payment.error.gatewayUnavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    return this.mapSession(session);
  }

  private async assertAvailable(courtId: string, start: Date, end: Date) {
    const now = new Date();

    const blockingOverlap: Prisma.BookingWhereInput = {
      courtId,
      startAt: { lt: end },
      endAt: { gt: start },
      status: BookingStatus.CONFIRMED,
    };

    const bookingConflict = await this.db.booking.count({
      where: blockingOverlap,
    });

    if (bookingConflict > 0)
      throw new HttpException('booking.error.conflict', HttpStatus.CONFLICT);

    const sessionConflict = await this.db.bookingCheckoutSession.count({
      where: {
        courtId,
        startAt: { lt: end },
        endAt: { gt: start },
        status: {
          in: [
            BookingCheckoutSessionStatus.OPEN,
            BookingCheckoutSessionStatus.FINALIZING,
          ],
        },
        expiresAt: { gt: now },
      },
    });

    if (sessionConflict > 0)
      throw new HttpException('booking.error.conflict', HttpStatus.CONFLICT);
  }

  private getPaymentDeadlineMin(): number {
    return (
      this.configService.get<number>('payment.paymentDeadlineMin') ??
      DEFAULT_PAYMENT_DEADLINE_MIN
    );
  }

  private inc() {
    return {
      participants: true,
      payments: true,
      statusHistory: { orderBy: { createdAt: 'desc' } as any },
    };
  }

  private map(b: any): BookingResponseDto {
    return {
      ...b,
      totalPrice: Number(b.totalPrice),
      paidAmount: Number(b.paidAmount),
      participants: b.participants || [],
      payments: b.payments || [],
      statusHistory: b.statusHistory || [],
    };
  }

  private mapSession(s: any): BookingCheckoutSessionResponseDto {
    return {
      id: s.id,
      status: s.status,
      bookingId: s.bookingId,
      organizerId: s.organizerId,
      courtId: s.courtId,
      startAt: s.startAt,
      endAt: s.endAt,
      durationMinutes: s.durationMinutes,
      amount: Number(s.amount),
      currency: s.currency,
      reference: s.reference,
      paymentMethod: s.paymentMethod,
      phone: this.maskPhone(s.phone),
      failureReason: s.failureReason,
      expiresAt: s.expiresAt,
      paidAt: s.paidAt,
      completedAt: s.completedAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  private maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    if (phone.length <= 4) return `*** ${phone}`;
    return `*** ${phone.slice(-4)}`;
  }
}
