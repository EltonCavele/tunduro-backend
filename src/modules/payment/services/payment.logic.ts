import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { PaymentListQueryRequestDto } from '../dtos/request/payment.request';
import {
  PaymentBookingSummaryResponseDto,
  PaymentResponseDto,
} from '../dtos/response/payment.response';

type PaymentWithBooking = Prisma.PaymentTransactionGetPayload<{
  include: {
    booking: {
      select: {
        id: true;
        courtId: true;
        organizerId: true;
        startAt: true;
        endAt: true;
        status: true;
      };
    };
  };
}>;

@Injectable()
export class PaymentService {
  constructor(private readonly databaseService: DatabaseService) {}

  async listPayments(
    user: IAuthUser,
    query: PaymentListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<PaymentResponseDto>> {
    const page = this.getSafePage(query.page);
    const pageSize = this.getSafePageSize(query.pageSize);
    const skip = (page - 1) * pageSize;

    const where: Prisma.PaymentTransactionWhereInput = {
      ...(user.role === Role.ADMIN ? {} : { userId: user.userId }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [totalItems, payments] = await Promise.all([
      this.databaseService.paymentTransaction.count({ where }),
      this.databaseService.paymentTransaction.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          booking: {
            select: {
              id: true,
              courtId: true,
              organizerId: true,
              startAt: true,
              endAt: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return {
      items: payments.map(payment => this.serializePayment(payment)),
      metadata: {
        currentPage: page,
        itemsPerPage: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async getPaymentById(
    user: IAuthUser,
    paymentId: string
  ): Promise<PaymentResponseDto> {
    const payment = await this.databaseService.paymentTransaction.findFirst({
      where: {
        id: paymentId,
        ...(user.role === Role.ADMIN ? {} : { userId: user.userId }),
      },
      include: {
        booking: {
          select: {
            id: true,
            courtId: true,
            organizerId: true,
            startAt: true,
            endAt: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      throw new HttpException('payment.error.notFound', HttpStatus.NOT_FOUND);
    }

    return this.serializePayment(payment);
  }

  private serializePayment(payment: PaymentWithBooking): PaymentResponseDto {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      userId: payment.userId,
      type: payment.type,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      reference: payment.reference,
      metadata: (payment.metadata as Record<string, unknown> | null) ?? null,
      processedAt: payment.processedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      booking: this.serializeBooking(payment.booking),
    };
  }

  private serializeBooking(
    booking: PaymentWithBooking['booking']
  ): PaymentBookingSummaryResponseDto {
    return {
      id: booking.id,
      courtId: booking.courtId,
      organizerId: booking.organizerId,
      startAt: booking.startAt,
      endAt: booking.endAt,
      status: booking.status,
    };
  }

  private getSafePage(page?: number): number {
    const parsed = Number(page);
    if (!parsed || Number.isNaN(parsed) || parsed < 1) {
      return 1;
    }

    return Math.floor(parsed);
  }

  private getSafePageSize(pageSize?: number, fallback = 10, max = 100): number {
    const parsed = Number(pageSize);
    if (!parsed || Number.isNaN(parsed) || parsed < 1) {
      return fallback;
    }

    return Math.min(Math.floor(parsed), max);
  }
}
