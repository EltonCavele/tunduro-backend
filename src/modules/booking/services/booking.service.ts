import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
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
import { CourtService } from 'src/modules/court/services/court.service';

import {
  BookingAdminCancelRequestDto,
  BookingAdminCreateRequestDto,
  BookingAdminQueryRequestDto,
  BookingCancelRequestDto,
  BookingCreateRequestDto,
  BookingMeQueryRequestDto,
  BookingPaymentConfirmRequestDto,
} from '../dtos/request/booking.request';
import { BookingResponseDto } from '../dtos/response/booking.response';

const PAYMENT_DEADLINE_MIN = 30;

function isPaymentStaff(role: Role): boolean {
  return role === Role.ADMIN || role === Role.EMPLOYEE;
}

@Injectable()
export class BookingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly courtService: CourtService
  ) {}

  /**
   * Cria reserva em PENDING; pagamento confirmado depois por admin/employee no painel.
   */
  async createBooking(
    user: IAuthUser,
    dto: BookingCreateRequestDto
  ): Promise<BookingResponseDto> {
    const court = await this.courtService.assertCourtIsBookable(dto.courtId);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);

    await this.assertAvailable(court.id, start, end);

    const amount = Number(
      (Number(court.pricePerHour) * (duration / 60)).toFixed(2)
    );
    const ref = `PAY-${randomUUID().slice(0, 8).toUpperCase()}`;
    const paymentDueAt = new Date(Date.now() + PAYMENT_DEADLINE_MIN * 60000);

    const booking = await this.db.$transaction(async tx => {
      const b = await tx.booking.create({
        data: {
          courtId: court.id,
          organizerId: user.userId,
          startAt: start,
          endAt: end,
          durationMinutes: duration,
          totalPrice: amount,
          currency: court.currency,
          paidAmount: 0,
          status: BookingStatus.PENDING,
          paymentDueAt,
          participants: {
            create: {
              userId: user.userId,
              status: ParticipantStatus.ACCEPTED,
              isOrganizer: true,
            },
          },
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: b.id,
          fromStatus: null,
          toStatus: BookingStatus.PENDING,
          reason: 'booking created, awaiting payment confirmation',
        },
      });

      await tx.paymentTransaction.create({
        data: {
          bookingId: b.id,
          userId: user.userId,
          type: PaymentType.BOOKING,
          status: PaymentStatus.PENDING,
          amount,
          currency: court.currency,
          reference: ref,
        },
      });

      return b;
    });

    const created = await this.db.booking.findUnique({
      where: { id: booking.id },
      include: this.inc(),
    });

    return this.map(created!);
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

  /**
   * Confirma pagamento manual (painel): método MPESA, EMOLA, CASH ou CARD + registo de quem confirmou.
   */
  async confirmBookingPayment(
    actor: IAuthUser,
    bookingId: string,
    dto: BookingPaymentConfirmRequestDto
  ): Promise<BookingResponseDto> {
    if (!isPaymentStaff(actor.role)) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    const meta: Record<string, unknown> = {};
    if (dto.reference !== undefined) meta.externalReference = dto.reference;
    if (dto.note !== undefined) meta.note = dto.note;

    await this.db.$transaction(async tx => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { payments: true },
      });
      if (!b)
        throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
      if (b.status !== BookingStatus.PENDING) {
        throw new HttpException(
          'booking.error.invalidStatusForConfirmation',
          HttpStatus.BAD_REQUEST
        );
      }

      const pendingPayment = b.payments.find(
        p =>
          p.type === PaymentType.BOOKING && p.status === PaymentStatus.PENDING
      );
      if (!pendingPayment) {
        throw new HttpException(
          'booking.error.invalidStatusForConfirmation',
          HttpStatus.BAD_REQUEST
        );
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          paidAmount: b.totalPrice,
        },
      });

      await tx.paymentTransaction.update({
        where: { id: pendingPayment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          method: dto.method,
          confirmedByUserId: actor.userId,
          processedAt: new Date(),
          metadata:
            Object.keys(meta).length > 0
              ? ({
                  ...(pendingPayment.metadata as object),
                  ...meta,
                } as Prisma.InputJsonValue)
              : pendingPayment.metadata ?? undefined,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: BookingStatus.PENDING,
          toStatus: BookingStatus.CONFIRMED,
          reason: `payment confirmed via ${dto.method}`,
          changedByUserId: actor.userId,
        },
      });
    });

    return this.adminGetBooking(bookingId);
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

    if (dto.confirmPaymentNow && !dto.method) {
      throw new HttpException(
        'booking.error.confirmRequiresMethod',
        HttpStatus.BAD_REQUEST
      );
    }

    const court = await this.courtService.assertCourtIsBookable(dto.courtId);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);

    await this.assertAvailable(court.id, start, end);

    const amount = Number(
      (Number(court.pricePerHour) * (duration / 60)).toFixed(2)
    );
    const ref = `PAY-${randomUUID().slice(0, 8).toUpperCase()}`;
    const fastConfirm = Boolean(dto.confirmPaymentNow && dto.method);
    const paymentDueAt = fastConfirm
      ? null
      : new Date(Date.now() + PAYMENT_DEADLINE_MIN * 60000);

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
          paidAmount: fastConfirm ? amount : 0,
          status: fastConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
          paymentDueAt,
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

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: b.id,
          fromStatus: null,
          toStatus: fastConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
          reason: fastConfirm
            ? `admin booking with payment (${dto.method})`
            : 'admin booking, awaiting payment confirmation',
          changedByUserId: adminUser.userId,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          bookingId: b.id,
          userId: dto.userId,
          type: PaymentType.BOOKING,
          status: fastConfirm ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
          amount,
          currency: court.currency,
          reference: ref,
          method: fastConfirm ? dto.method : undefined,
          confirmedByUserId: fastConfirm ? adminUser.userId : undefined,
          processedAt: fastConfirm ? new Date() : null,
          metadata: fastConfirm
            ? ({
                createdByAdmin: adminUser.userId,
              } as Prisma.InputJsonValue)
            : undefined,
        },
      });

      return b;
    });

    const created = await this.db.booking.findUnique({
      where: { id: booking.id },
      include: this.inc(),
    });

    return this.map(created!);
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

    await this.db.$transaction(async tx => {
      await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: dto.reason || 'cancelled by admin',
        },
      });

      await tx.paymentTransaction.updateMany({
        where: {
          bookingId: id,
          status: PaymentStatus.PENDING,
          type: PaymentType.BOOKING,
        },
        data: { status: PaymentStatus.CANCELLED },
      });
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
          status: PaymentStatus.PENDING,
          type: PaymentType.BOOKING,
        },
        data: { status: PaymentStatus.CANCELLED },
      });
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

  /**
   * Cancela reservas PENDING cujo prazo de pagamento expirou (cron).
   */
  async expirePendingBookings(): Promise<number> {
    const now = new Date();
    const expired = await this.db.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        paymentDueAt: { lt: now },
      },
      select: { id: true },
    });

    let count = 0;
    for (const row of expired) {
      await this.db.$transaction(async tx => {
        await tx.booking.update({
          where: { id: row.id },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: 'payment timeout',
          },
        });

        await tx.paymentTransaction.updateMany({
          where: {
            bookingId: row.id,
            status: PaymentStatus.PENDING,
            type: PaymentType.BOOKING,
          },
          data: { status: PaymentStatus.CANCELLED },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: row.id,
            fromStatus: BookingStatus.PENDING,
            toStatus: BookingStatus.CANCELLED,
            reason: 'payment timeout',
            changedByUserId: null,
          },
        });
      });
      count += 1;
    }

    return count;
  }

  private async assertAvailable(courtId: string, start: Date, end: Date) {
    const now = new Date();

    const blockingOverlap: Prisma.BookingWhereInput = {
      courtId,
      startAt: { lt: end },
      endAt: { gt: start },
      OR: [
        { status: BookingStatus.CONFIRMED },
        {
          status: BookingStatus.PENDING,
          paymentDueAt: { gt: now },
        },
      ],
    };

    const bookingConflict = await this.db.booking.count({
      where: blockingOverlap,
    });

    if (bookingConflict > 0)
      throw new HttpException('booking.error.conflict', HttpStatus.CONFLICT);
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
