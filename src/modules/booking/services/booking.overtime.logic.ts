import { randomUUID } from 'crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  OvertimeStatus,
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
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';

import {
  OvertimeAdminDeclineRequestDto,
  OvertimeAdminListQueryRequestDto,
  OvertimeRequestCreateDto,
} from '../dtos/request/booking.request';
import { OvertimeRequestResponseDto } from '../dtos/response/booking.response';

const BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

@Injectable()
export class BookingOvertimeService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly helperNotificationService: HelperNotificationService,
    private readonly lightingOrchestratorService: LightingOrchestratorService
  ) {}

  async createRequest(
    user: IAuthUser,
    bookingId: string,
    payload: OvertimeRequestCreateDto
  ): Promise<OvertimeRequestResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        participants: true,
        court: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const isAllowed =
      booking.organizerId === user.userId || user.role === Role.ADMIN;

    if (!isAllowed) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException(
        'booking.error.overtimeOnlyConfirmed',
        HttpStatus.BAD_REQUEST
      );
    }

    if (new Date() >= booking.endAt) {
      throw new HttpException(
        'booking.error.overtimeWindowClosed',
        HttpStatus.BAD_REQUEST
      );
    }

    if (Number(booking.paidAmount) < Number(booking.totalPrice)) {
      throw new HttpException(
        'booking.error.overtimeRequiresPaidBooking',
        HttpStatus.BAD_REQUEST
      );
    }

    const existingPending = await this.databaseService.overtimeRequest.findFirst({
      where: {
        bookingId,
        status: {
          in: [
            OvertimeStatus.PENDING,
            OvertimeStatus.APPROVED,
            OvertimeStatus.PAYMENT_PENDING,
          ],
        },
      },
    });

    if (existingPending) {
      throw new HttpException(
        'booking.error.overtimeAlreadyPending',
        HttpStatus.CONFLICT
      );
    }

    const created = await this.databaseService.overtimeRequest.create({
      data: {
        bookingId,
        requestedByUserId: user.userId,
        blocks: payload.blocks,
        status: OvertimeStatus.PENDING,
      },
    });

    await this.notifyAdmins(
      'Overtime request pending',
      `Booking ${bookingId} has a pending overtime request.`
    );

    return this.serialize(created);
  }

  async listMyRequests(
    user: IAuthUser,
    bookingId: string
  ): Promise<OvertimeRequestResponseDto[]> {
    const booking = await this.databaseService.booking.findUnique({
      where: {
        id: bookingId,
      },
      include: {
        participants: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const isParticipant = booking.participants.some(
      participant =>
        participant.userId === user.userId &&
        participant.status === ParticipantStatus.ACCEPTED
    );

    const allowed =
      user.role === Role.ADMIN ||
      booking.organizerId === user.userId ||
      isParticipant;

    if (!allowed) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    const items = await this.databaseService.overtimeRequest.findMany({
      where: {
        bookingId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return items.map(item => this.serialize(item));
  }

  async listAdminRequests(
    query: OvertimeAdminListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<OvertimeRequestResponseDto>> {
    const page = this.safePage(query.page);
    const pageSize = this.safePageSize(query.pageSize, 20);
    const parsedStatus = this.parseStatus(query.status);

    const where: Prisma.OvertimeRequestWhereInput = {
      ...(parsedStatus ? { status: parsedStatus } : {}),
    };

    const [totalItems, requests] = await Promise.all([
      this.databaseService.overtimeRequest.count({ where }),
      this.databaseService.overtimeRequest.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      items: requests.map(item => this.serialize(item)),
      metadata: {
        currentPage: page,
        itemsPerPage: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async approveRequest(
    adminUser: IAuthUser,
    overtimeRequestId: string
  ): Promise<OvertimeRequestResponseDto> {
    const overtimeRequest = await this.databaseService.overtimeRequest.findUnique({
      where: {
        id: overtimeRequestId,
      },
      include: {
        booking: {
          include: {
            court: true,
          },
        },
      },
    });

    if (!overtimeRequest) {
      throw new HttpException(
        'booking.error.overtimeNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (overtimeRequest.status !== OvertimeStatus.PENDING) {
      throw new HttpException(
        'booking.error.overtimeInvalidState',
        HttpStatus.BAD_REQUEST
      );
    }

    const booking = overtimeRequest.booking;
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException(
        'booking.error.overtimeOnlyConfirmed',
        HttpStatus.BAD_REQUEST
      );
    }

    const extensionMinutes = overtimeRequest.blocks * 60;
    const nextEndAt = this.addMinutes(booking.endAt, extensionMinutes);

    await this.assertCourtAvailability(
      booking.courtId,
      booking.startAt,
      nextEndAt,
      booking.id
    );

    await this.assertOrganizerAvailability(
      booking.organizerId,
      booking.startAt,
      nextEndAt,
      booking.id
    );

    await this.assertAcceptedParticipantsAvailability(
      booking.id,
      booking.startAt,
      nextEndAt
    );

    const amount = this.calculatePrice(
      booking.court.pricePerHour,
      extensionMinutes
    );

    const now = new Date();
    const payment = await this.databaseService.paymentTransaction.create({
      data: {
        bookingId: booking.id,
        userId: booking.organizerId,
        type: PaymentType.OVERTIME_ADJUSTMENT,
        status: PaymentStatus.PENDING,
        amount: this.decimal(amount),
        currency: booking.currency,
        reference: this.paymentReference('OT'),
        metadata: {
          source: 'overtime_approval',
          overtimeRequestId,
          blocks: overtimeRequest.blocks,
          extensionMinutes,
        },
      },
    });

    const updated = await this.databaseService.overtimeRequest.update({
      where: {
        id: overtimeRequest.id,
      },
      data: {
        status: OvertimeStatus.PAYMENT_PENDING,
        approvedByUserId: adminUser.userId,
        paymentTransactionId: payment.id,
        expiresAt: this.addMinutes(now, 15),
      },
    });

    await this.notifyUser(
      booking.organizerId,
      'Overtime approved - payment pending',
      'Your overtime request was approved. Confirm payment to apply extension.'
    );

    return this.serialize(updated);
  }

  async declineRequest(
    adminUser: IAuthUser,
    overtimeRequestId: string,
    payload: OvertimeAdminDeclineRequestDto
  ): Promise<OvertimeRequestResponseDto> {
    const overtimeRequest = await this.databaseService.overtimeRequest.findUnique({
      where: {
        id: overtimeRequestId,
      },
      include: {
        paymentTransaction: true,
        booking: true,
      },
    });

    if (!overtimeRequest) {
      throw new HttpException(
        'booking.error.overtimeNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    const allowedDeclineStatuses: OvertimeStatus[] = [
      OvertimeStatus.PENDING,
      OvertimeStatus.APPROVED,
      OvertimeStatus.PAYMENT_PENDING,
    ];

    if (!allowedDeclineStatuses.includes(overtimeRequest.status)) {
      throw new HttpException(
        'booking.error.overtimeInvalidState',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();

    const updated = await this.databaseService.$transaction(async tx => {
      if (
        overtimeRequest.paymentTransactionId &&
        overtimeRequest.paymentTransaction?.status === PaymentStatus.PENDING
      ) {
        await tx.paymentTransaction.update({
          where: {
            id: overtimeRequest.paymentTransactionId,
          },
          data: {
            status: PaymentStatus.CANCELLED,
            processedAt: now,
          },
        });
      }

      return tx.overtimeRequest.update({
        where: {
          id: overtimeRequest.id,
        },
        data: {
          status: OvertimeStatus.DECLINED,
          approvedByUserId: adminUser.userId,
          declineReason: payload.reason?.trim() || 'declined_by_admin',
          processedAt: now,
        },
      });
    });

    await this.notifyUser(
      overtimeRequest.requestedByUserId,
      'Overtime request declined',
      'Your overtime request was declined by the club admin.'
    );

    return this.serialize(updated);
  }

  async confirmOvertimePayment(
    user: IAuthUser,
    overtimeRequestId: string
  ): Promise<OvertimeRequestResponseDto> {
    const overtimeRequest = await this.databaseService.overtimeRequest.findUnique({
      where: {
        id: overtimeRequestId,
      },
      include: {
        booking: {
          include: {
            court: true,
            participants: true,
          },
        },
        paymentTransaction: true,
      },
    });

    if (!overtimeRequest) {
      throw new HttpException(
        'booking.error.overtimeNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    const booking = overtimeRequest.booking;

    const allowed =
      user.role === Role.ADMIN ||
      user.userId === overtimeRequest.requestedByUserId ||
      user.userId === booking.organizerId;

    if (!allowed) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (overtimeRequest.status !== OvertimeStatus.PAYMENT_PENDING) {
      throw new HttpException(
        'booking.error.overtimePaymentNotPending',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!overtimeRequest.paymentTransactionId || !overtimeRequest.paymentTransaction) {
      throw new HttpException(
        'booking.error.overtimePaymentMissing',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();

    if (overtimeRequest.expiresAt && overtimeRequest.expiresAt < now) {
      await this.databaseService.$transaction(async tx => {
        await tx.overtimeRequest.update({
          where: {
            id: overtimeRequest.id,
          },
          data: {
            status: OvertimeStatus.EXPIRED,
            processedAt: now,
          },
        });

        await tx.paymentTransaction.update({
          where: {
            id: overtimeRequest.paymentTransactionId as string,
          },
          data: {
            status: PaymentStatus.CANCELLED,
            processedAt: now,
          },
        });
      });

      throw new HttpException(
        'booking.error.overtimePaymentExpired',
        HttpStatus.BAD_REQUEST
      );
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException(
        'booking.error.overtimeOnlyConfirmed',
        HttpStatus.BAD_REQUEST
      );
    }

    const extensionMinutes = overtimeRequest.blocks * 60;
    const nextEndAt = this.addMinutes(booking.endAt, extensionMinutes);

    await this.assertCourtAvailability(
      booking.courtId,
      booking.startAt,
      nextEndAt,
      booking.id
    );

    await this.assertOrganizerAvailability(
      booking.organizerId,
      booking.startAt,
      nextEndAt,
      booking.id
    );

    await this.assertAcceptedParticipantsAvailability(
      booking.id,
      booking.startAt,
      nextEndAt
    );

    const amount = Number(overtimeRequest.paymentTransaction.amount);

    const updated = await this.databaseService.$transaction(async tx => {
      await tx.paymentTransaction.update({
        where: {
          id: overtimeRequest.paymentTransactionId as string,
        },
        data: {
          status: PaymentStatus.COMPLETED,
          processedAt: now,
        },
      });

      await tx.booking.update({
        where: {
          id: booking.id,
        },
        data: {
          endAt: nextEndAt,
          durationMinutes: booking.durationMinutes + extensionMinutes,
          totalPrice: this.decimal(Number(booking.totalPrice) + amount),
          paidAmount: this.decimal(Number(booking.paidAmount) + amount),
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: BookingStatus.CONFIRMED,
          toStatus: BookingStatus.CONFIRMED,
          reason: 'overtime_paid_extension',
          changedByUserId: user.userId,
        },
      });

      return tx.overtimeRequest.update({
        where: {
          id: overtimeRequest.id,
        },
        data: {
          status: OvertimeStatus.PAID,
          processedAt: now,
        },
      });
    });

    await this.notifyBookingMembers(
      booking.id,
      'Booking extended',
      `This booking was extended by ${extensionMinutes} minutes.`
    );

    await this.lightingOrchestratorService.handleBookingExtended(booking.id);

    return this.serialize(updated);
  }

  async processPaymentExpirations(): Promise<number> {
    const now = new Date();

    const expired = await this.databaseService.overtimeRequest.findMany({
      where: {
        status: OvertimeStatus.PAYMENT_PENDING,
        expiresAt: {
          lt: now,
        },
      },
      include: {
        paymentTransaction: true,
      },
    });

    for (const request of expired) {
      await this.databaseService.$transaction(async tx => {
        await tx.overtimeRequest.update({
          where: {
            id: request.id,
          },
          data: {
            status: OvertimeStatus.EXPIRED,
            processedAt: now,
          },
        });

        if (
          request.paymentTransactionId &&
          request.paymentTransaction?.status === PaymentStatus.PENDING
        ) {
          await tx.paymentTransaction.update({
            where: {
              id: request.paymentTransactionId,
            },
            data: {
              status: PaymentStatus.CANCELLED,
              processedAt: now,
            },
          });
        }
      });
    }

    return expired.length;
  }

  private async assertCourtAvailability(
    courtId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId: string
  ): Promise<void> {
    const conflict = await this.databaseService.booking.findFirst({
      where: {
        courtId,
        status: {
          in: BLOCKING_BOOKING_STATUSES,
        },
        startAt: {
          lt: endAt,
        },
        endAt: {
          gt: startAt,
        },
        id: {
          not: excludeBookingId,
        },
      },
      select: {
        id: true,
      },
    });

    if (conflict) {
      throw new HttpException(
        'booking.error.slotAlreadyBooked',
        HttpStatus.CONFLICT
      );
    }
  }

  private async assertOrganizerAvailability(
    organizerId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId: string
  ): Promise<void> {
    const conflict = await this.databaseService.booking.findFirst({
      where: {
        organizerId,
        status: {
          in: BLOCKING_BOOKING_STATUSES,
        },
        startAt: {
          lt: endAt,
        },
        endAt: {
          gt: startAt,
        },
        id: {
          not: excludeBookingId,
        },
      },
      select: {
        id: true,
      },
    });

    if (conflict) {
      throw new HttpException(
        'booking.error.organizerOverlap',
        HttpStatus.CONFLICT
      );
    }
  }

  private async assertAcceptedParticipantsAvailability(
    bookingId: string,
    startAt: Date,
    endAt: Date
  ): Promise<void> {
    const acceptedParticipants = await this.databaseService.bookingParticipant.findMany(
      {
        where: {
          bookingId,
          status: ParticipantStatus.ACCEPTED,
          isOrganizer: false,
        },
        select: {
          userId: true,
        },
      }
    );

    for (const participant of acceptedParticipants) {
      const conflict = await this.databaseService.bookingParticipant.findFirst({
        where: {
          userId: participant.userId,
          status: ParticipantStatus.ACCEPTED,
          booking: {
            status: {
              in: BLOCKING_BOOKING_STATUSES,
            },
            startAt: {
              lt: endAt,
            },
            endAt: {
              gt: startAt,
            },
            id: {
              not: bookingId,
            },
          },
        },
        select: {
          id: true,
        },
      });

      if (conflict) {
        throw new HttpException(
          'booking.error.participantOverlap',
          HttpStatus.CONFLICT
        );
      }
    }
  }

  private parseStatus(value?: string): OvertimeStatus | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().toUpperCase() as OvertimeStatus;
    if (!Object.values(OvertimeStatus).includes(normalized)) {
      return undefined;
    }

    return normalized;
  }

  private serialize(item: any): OvertimeRequestResponseDto {
    return {
      id: item.id,
      bookingId: item.bookingId,
      requestedByUserId: item.requestedByUserId,
      approvedByUserId: item.approvedByUserId ?? null,
      blocks: item.blocks,
      status: item.status,
      declineReason: item.declineReason ?? null,
      paymentTransactionId: item.paymentTransactionId ?? null,
      expiresAt: item.expiresAt ?? null,
      processedAt: item.processedAt ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private safePage(value?: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  private safePageSize(value?: number, fallback = 10): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(parsed, 100);
  }

  private calculatePrice(
    pricePerHour: Prisma.Decimal | number,
    durationMinutes: number
  ): number {
    const price = Number(pricePerHour);
    const blocks = durationMinutes / 60;
    return Number((price * blocks).toFixed(2));
  }

  private decimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(Number(value));
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  private paymentReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  private async notifyBookingMembers(
    bookingId: string,
    subject: string,
    message: string
  ): Promise<void> {
    const participants = await this.databaseService.bookingParticipant.findMany({
      where: {
        bookingId,
        status: ParticipantStatus.ACCEPTED,
      },
      select: {
        userId: true,
      },
    });

    for (const participant of participants) {
      await this.notifyUser(participant.userId, subject, message);
    }
  }

  private async notifyAdmins(subject: string, message: string): Promise<void> {
    const admins = await this.databaseService.user.findMany({
      where: {
        role: Role.ADMIN,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    for (const admin of admins) {
      await this.notifyUser(admin.id, subject, message);
    }
  }

  private async notifyUser(
    userId: string,
    subject: string,
    message: string
  ): Promise<void> {
    const user = await this.databaseService.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        email: true,
        expoPushToken: true,
        notifyEmail: true,
        notifyPush: true,
      },
    });

    if (!user) {
      return;
    }

    if (user.notifyEmail !== false && user.email) {
      await this.helperNotificationService.sendEmail({
        to: user.email,
        subject,
        text: message,
        html: `<p>${message}</p>`,
      });
    }

    if (user.notifyPush !== false && user.expoPushToken) {
      await this.helperNotificationService.sendPush({
        to: user.expoPushToken,
        title: subject,
        body: message,
      });
    }
  }
}
