import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';
import { CourtService } from 'src/modules/court/services/court.service';
import {
  PaysuiteClientService,
  PaysuiteWebhookPayload,
} from './paysuite.client.service';

import {
  BookingAdminCancelRequestDto,
  BookingAdminCreateRequestDto,
  BookingAdminQueryRequestDto,
  BookingCancelRequestDto,
  BookingCheckInRequestDto,
  BookingCreateRequestDto,
  BookingMeQueryRequestDto,
} from '../dtos/request/booking.request';
import {
  BookingCheckoutSessionResponseDto,
  BookingResponseDto,
} from '../dtos/response/booking.response';

const BLOCKING_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED];
const PAY_MINUTES = 15;

@Injectable()
export class BookingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notify: HelperNotificationService,
    private readonly courtService: CourtService,
    private readonly paysuite: PaysuiteClientService
  ) {}

  // --- Core CRUD ---

  /**
   * INICIA O FLUXO DE CRIAÇÃO:
   * Valida disponibilidade e retorna um link de pagamento.
   * O 'Booking' real só é criado no banco após o sucesso do pagamento (via Webhook).
   */
  async createBooking(
    user: IAuthUser,
    dto: BookingCreateRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    const court = await this.courtService.assertCourtIsBookable(dto.courtId);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);

    // Valida se o horário está disponível
    await this.assertAvailable(court.id, start, end);

    const amount = Number(
      (Number(court.pricePerHour) * (duration / 60)).toFixed(2)
    );
    const ref = `PAY-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Cria uma sessão de checkout (pre-booking)
    let session = await this.db.bookingCheckoutSession.create({
      data: {
        courtId: court.id,
        organizerId: user.userId,
        startAt: start,
        endAt: end,
        durationMinutes: duration,
        amount,
        currency: court.currency,
        reference: ref,
        status: BookingCheckoutSessionStatus.OPEN,
        expiresAt: new Date(Date.now() + PAY_MINUTES * 60000),
      },
    });

    // Inicia pagamento na Paysuite
    const pay = await this.paysuite.createPaymentRequest({
      amount: amount.toFixed(2),
      reference: ref,
      description: `Court ${court.name}`,
      callback_url: 'https://api.tunduro.com/v1/integrations/paysuite/webhook',
      return_url: `https://api.tunduro.com/v1/integrations/paysuite/return?sessionId=${session.id}`,
    });

    session = await this.db.bookingCheckoutSession.update({
      where: { id: session.id },
      data: { checkoutUrl: pay.checkout_url, paysuitePaymentId: pay.id },
    });

    return session as any;
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

  // --- Payments ---

  async handlePaysuiteWebhook(
    body: any,
    payload: PaysuiteWebhookPayload
  ): Promise<void> {
    const session = await this.db.bookingCheckoutSession.findFirst({
      where: { paysuitePaymentId: payload.data.id },
    });
    if (!session || payload.event !== 'payment.success') return;

    // BLOCO DE CRIAÇÃO DO BOOKING (Só acontece se o pagamento for confirmado)
    await this.db.$transaction(async tx => {
      const b = await tx.booking.create({
        data: {
          courtId: session.courtId,
          organizerId: session.organizerId,
          startAt: session.startAt,
          endAt: session.endAt,
          durationMinutes: session.durationMinutes,
          totalPrice: session.amount,
          currency: session.currency,
          paidAmount: session.amount,
          status: BookingStatus.CONFIRMED,
          participants: {
            create: {
              userId: session.organizerId,
              status: ParticipantStatus.ACCEPTED,
              isOrganizer: true,
            },
          },
        },
      });

      await tx.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          status: BookingCheckoutSessionStatus.COMPLETED,
          bookingId: b.id,
          paidAt: new Date(),
        },
      });

      await tx.paymentTransaction.create({
        data: {
          bookingId: b.id,
          userId: session.organizerId,
          type: PaymentType.BOOKING,
          status: PaymentStatus.COMPLETED,
          amount: session.amount,
          currency: session.currency,
          reference: session.reference,
          processedAt: new Date(),
        },
      });
    });
  }

  /**
   * Permite que um admin confirme o pagamento manualmente se necessário.
   */
  async confirmBookingPayment(
    user: IAuthUser,
    id: string
  ): Promise<BookingResponseDto> {
    const b = await this.db.booking.findUnique({ where: { id } });
    if (!b)
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);

    await this.db.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED, paidAmount: b.totalPrice },
    });

    return this.getBookingForUser(user, id);
  }

  async adminCreateBooking(
    adminUser: IAuthUser,
    dto: BookingAdminCreateRequestDto
  ): Promise<BookingResponseDto> {
    const user = await this.db.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    if (user.suspendedAt) {
      throw new HttpException('user.error.userSuspended', HttpStatus.FORBIDDEN);
    }

    const court = await this.courtService.assertCourtIsBookable(dto.courtId);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);

    await this.assertAvailable(court.id, start, end);

    const amount = Number(
      (Number(court.pricePerHour) * (duration / 60)).toFixed(2)
    );
    const isCashPayment = dto.paymentMethod?.toUpperCase() === 'CASH';

    const ref = `PAY-${randomUUID().slice(0, 8).toUpperCase()}`;

    const booking = await this.db.$transaction(async tx => {
      const b = await tx.booking.create({
        data: {
          courtId: court.id,
          organizerId: dto.userId,
          startAt: start,
          endAt: end,
          durationMinutes: duration,
          totalPrice: amount,
          currency: court.currency,
          paidAmount: isCashPayment ? amount : 0,
          status: isCashPayment
            ? BookingStatus.CONFIRMED
            : BookingStatus.PENDING,
          isAdminForced: true,
          participants: {
            create: {
              userId: dto.userId,
              status: ParticipantStatus.ACCEPTED,
              isOrganizer: true,
            },
          },
        },
      });

      await tx.paymentTransaction.create({
        data: {
          bookingId: b.id,
          userId: dto.userId,
          type: PaymentType.BOOKING,
          status: isCashPayment ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
          amount: amount,
          currency: court.currency,
          reference: ref,
          metadata: isCashPayment
            ? { method: 'CASH', createdBy: adminUser.userId }
            : null,
          processedAt: isCashPayment ? new Date() : null,
        },
      });

      return b;
    });

    const created = await this.db.booking.findUnique({
      where: { id: booking.id },
      include: this.inc(),
    });

    return this.map(created);
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
    admin: IAuthUser,
    id: string,
    dto: BookingAdminCancelRequestDto
  ): Promise<BookingResponseDto> {
    const b = await this.db.booking.findUnique({ where: { id } });
    if (!b)
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);

    await this.db.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason || 'cancelled by admin',
      },
    });

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

    await this.db.booking.update({
      where: { id },
      data: { checkedInAt: new Date(), checkInByUserId: admin.userId },
    });

    return this.adminGetBooking(id);
  }

  // --- Operations ---

  async cancelBooking(
    user: IAuthUser,
    id: string,
    dto: BookingCancelRequestDto
  ): Promise<BookingResponseDto> {
    const b = await this.db.booking.findUnique({ where: { id } });
    if (!b || (b.organizerId !== user.userId && user.role !== Role.ADMIN))
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);

    await this.db.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason || 'cancelled',
      },
    });

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

    await this.db.booking.update({
      where: { id },
      data: { checkedInAt: new Date(), checkInByUserId: user.userId },
    });

    return this.getBookingForUser(user, id);
  }

  // --- Helpers ---

  private async assertAvailable(courtId: string, start: Date, end: Date) {
    // Verifica se já existe um booking confirmado
    const bookingConflict = await this.db.booking.count({
      where: {
        courtId,
        status: { in: BLOCKING_STATUSES },
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (bookingConflict > 0)
      throw new HttpException('booking.error.conflict', HttpStatus.CONFLICT);

    // Verifica se já existe uma sessão de pagamento ativa para esse horário
    const sessionConflict = await this.db.bookingCheckoutSession.count({
      where: {
        courtId,
        status: BookingCheckoutSessionStatus.OPEN,
        expiresAt: { gt: new Date() },
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (sessionConflict > 0)
      throw new HttpException('booking.error.paymentInProgress', HttpStatus.CONFLICT);
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
}
