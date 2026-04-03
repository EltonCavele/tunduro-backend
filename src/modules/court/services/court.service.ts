import { randomUUID } from 'crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingCheckoutSessionStatus,
  BookingStatus,
  Court,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  CourtBookingsQueryRequestDto,
  CourtCreateRequestDto,
  CourtGalleryPresignRequestDto,
  CourtGalleryUpsertRequestDto,
  CourtListQueryRequestDto,
  CourtUpdateRequestDto,
} from '../dtos/request/court.create.request';
import {
  CourtBookingAdminResponseDto,
  CourtBookingPublicResponseDto,
  CourtGalleryPresignResponseDto,
  CourtResponseDto,
} from '../dtos/response/court.response';

const BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];
const BLOCKING_CHECKOUT_SESSION_STATUSES: BookingCheckoutSessionStatus[] = [
  BookingCheckoutSessionStatus.OPEN,
  BookingCheckoutSessionStatus.FINALIZING,
];

@Injectable()
export class CourtService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly helperNotificationService: HelperNotificationService
  ) {}

  async listCourts(
    query: CourtListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<CourtResponseDto>> {
    const page = this.getSafePage(query.page);
    const pageSize = this.getSafePageSize(query.pageSize);
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim();
    const surface = query.surface?.trim().toUpperCase();

    const slot = this.getSlotRange(query.startAt, query.endAt, false);

    const where: Prisma.CourtWhereInput = {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(surface ? { surface } : {}),
      ...(typeof query.priceMin === 'number' ||
      typeof query.priceMax === 'number'
        ? {
            pricePerHour: {
              ...(typeof query.priceMin === 'number'
                ? { gte: this.toDecimal(query.priceMin) }
                : {}),
              ...(typeof query.priceMax === 'number'
                ? { lte: this.toDecimal(query.priceMax) }
                : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { surface: { contains: q, mode: 'insensitive' } },
              { rules: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(slot
        ? {
            NOT: {
              bookings: {
                some: {
                  status: { in: BLOCKING_BOOKING_STATUSES },
                  startAt: { lt: slot.endAt },
                  endAt: { gt: slot.startAt },
                },
              },
            },
          }
        : {}),
    };

    const [totalItems, courts] = await Promise.all([
      this.databaseService.court.count({ where }),
      this.databaseService.court.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
    ]);

    const ratings = await this.databaseService.courtRating.groupBy({
      by: ['courtId'],
      where: {
        courtId: { in: courts.map(item => item.id) },
      },
      _count: {
        _all: true,
      },
      _avg: {
        courtScore: true,
        cleanlinessScore: true,
        lightingScore: true,
      },
    });

    const ratingMap = new Map(
      ratings.map(item => {
        const values = [
          Number(item._avg.courtScore ?? 0),
          Number(item._avg.cleanlinessScore ?? 0),
          Number(item._avg.lightingScore ?? 0),
        ];
        const average =
          values.reduce((acc, current) => acc + current, 0) /
          (values.filter(Boolean).length || 1);
        return [
          item.courtId,
          {
            average: Number(average.toFixed(2)),
            count: item._count._all,
          },
        ];
      })
    );

    return {
      items: courts.map(court =>
        this.serializeCourt(court, ratingMap.get(court.id))
      ),
      metadata: {
        currentPage: page,
        itemsPerPage: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async getCourt(courtId: string): Promise<CourtResponseDto> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        deletedAt: null,
      },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    const rating = await this.databaseService.courtRating.aggregate({
      where: { courtId },
      _count: { _all: true },
      _avg: {
        courtScore: true,
        cleanlinessScore: true,
        lightingScore: true,
      },
    });

    const values = [
      Number(rating._avg.courtScore ?? 0),
      Number(rating._avg.cleanlinessScore ?? 0),
      Number(rating._avg.lightingScore ?? 0),
    ];

    return this.serializeCourt(court, {
      average: Number(
        (
          values.reduce((acc, current) => acc + current, 0) /
          (values.filter(Boolean).length || 1)
        ).toFixed(2)
      ),
      count: rating._count._all,
    });
  }

  async getCourtBookings(
    courtId: string,
    isAdmin: boolean,
    query: CourtBookingsQueryRequestDto
  ): Promise<
    ApiPaginatedDataDto<
      CourtBookingPublicResponseDto | CourtBookingAdminResponseDto
    >
  > {
    await this.assertCourtExists(courtId);

    const page = this.getSafePage(query.page);
    const pageSize = this.getSafePageSize(query.pageSize, 20, 100);

    const start = query.startAt ? this.toDate(query.startAt, 'startAt') : null;
    const end = query.endAt ? this.toDate(query.endAt, 'endAt') : null;

    const where: Prisma.BookingWhereInput = {
      courtId,
      ...(start || end
        ? {
            AND: [
              ...(start ? [{ endAt: { gte: start } }] : []),
              ...(end ? [{ startAt: { lte: end } }] : []),
            ],
          }
        : {}),
    };

    const checkoutSessionWhere: Prisma.BookingCheckoutSessionWhereInput = {
      courtId,
      status: { in: BLOCKING_CHECKOUT_SESSION_STATUSES },
      expiresAt: {
        gt: new Date(),
      },
      ...(start || end
        ? {
            AND: [
              ...(start ? [{ endAt: { gte: start } }] : []),
              ...(end ? [{ startAt: { lte: end } }] : []),
            ],
          }
        : {}),
    };

    const [bookingCount, checkoutSessionCount, bookings, checkoutSessions] =
      await Promise.all([
        this.databaseService.booking.count({ where }),
        this.databaseService.bookingCheckoutSession.count({
          where: checkoutSessionWhere,
        }),
        this.databaseService.booking.findMany({
          where,
          orderBy: { startAt: 'desc' },
          include: {
            participants: {
              select: {
                userId: true,
              },
            },
          },
        }),
        this.databaseService.bookingCheckoutSession.findMany({
          where: checkoutSessionWhere,
          orderBy: { startAt: 'desc' },
        }),
      ]);

    const totalItems = bookingCount + checkoutSessionCount;

    const items = [
      ...bookings.map(item => {
        if (!isAdmin) {
          return {
            id: item.id,
            startAt: item.startAt,
            endAt: item.endAt,
            status: item.status,
          } as CourtBookingPublicResponseDto;
        }

        return {
          id: item.id,
          startAt: item.startAt,
          endAt: item.endAt,
          status: item.status,
          organizerId: item.organizerId,
          participantIds: item.participants.map(
            participant => participant.userId
          ),
        } as CourtBookingAdminResponseDto;
      }),
      ...checkoutSessions.map(item => {
        if (!isAdmin) {
          return {
            id: item.id,
            startAt: item.startAt,
            endAt: item.endAt,
            status: 'PAYMENT_PENDING',
          } as CourtBookingPublicResponseDto;
        }

        return {
          id: item.id,
          startAt: item.startAt,
          endAt: item.endAt,
          status: 'PAYMENT_PENDING',
          organizerId: item.organizerId,
          participantIds: Array.isArray(item.participantUserIds)
            ? item.participantUserIds.filter(
                participantId => typeof participantId === 'string'
              )
            : [],
        } as CourtBookingAdminResponseDto;
      }),
    ]
      .sort((left, right) => right.startAt.getTime() - left.startAt.getTime())
      .slice((page - 1) * pageSize, page * pageSize);

    return {
      items,
      metadata: {
        currentPage: page,
        itemsPerPage: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async createCourt(payload: CourtCreateRequestDto): Promise<CourtResponseDto> {
    const created = await this.databaseService.court.create({
      data: {
        name: payload.name.trim(),
        type: payload.type,
        surface: payload.surface.trim().toUpperCase(),
        hasLighting: payload.hasLighting,
        rules: payload.rules?.trim() || null,
        pricePerHour: this.toDecimal(payload.pricePerHour),
        currency: (payload.currency ?? 'MZN').trim().toUpperCase(),
        maxPlayers: payload.maxPlayers ?? 4,
        lightingDeviceId: payload.lightingDeviceId ?? [],
        lightingEnabled: payload.lightingEnabled ?? false,
        lightingOnOffsetMin: payload.lightingOnOffsetMin ?? 0,
        lightingOffBufferMin: payload.lightingOffBufferMin ?? 5,
        quietHoursEnabled: payload.quietHoursEnabled ?? true,
        quietHoursStart: payload.quietHoursStart ?? '22:00',
        quietHoursEnd: payload.quietHoursEnd ?? '06:00',
        quietHoursHardBlock: payload.quietHoursHardBlock ?? true,
      },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return this.serializeCourt(created, { average: 0, count: 0 });
  }

  async updateCourt(
    courtId: string,
    payload: CourtUpdateRequestDto
  ): Promise<CourtResponseDto> {
    await this.assertCourtExists(courtId);

    const updated = await this.databaseService.court.update({
      where: { id: courtId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.surface !== undefined
          ? { surface: payload.surface.trim().toUpperCase() }
          : {}),
        ...(payload.hasLighting !== undefined
          ? { hasLighting: payload.hasLighting }
          : {}),
        ...(payload.rules !== undefined
          ? { rules: payload.rules?.trim() || null }
          : {}),
        ...(payload.pricePerHour !== undefined
          ? { pricePerHour: this.toDecimal(payload.pricePerHour) }
          : {}),
        ...(payload.currency !== undefined
          ? { currency: payload.currency.trim().toUpperCase() }
          : {}),
        ...(payload.maxPlayers !== undefined
          ? { maxPlayers: payload.maxPlayers }
          : {}),
        ...(payload.isActive !== undefined
          ? { isActive: payload.isActive }
          : {}),
        ...(payload.lightingDeviceId !== undefined
          ? { lightingDeviceId: payload.lightingDeviceId }
          : {}),
        ...(payload.lightingEnabled !== undefined
          ? { lightingEnabled: payload.lightingEnabled }
          : {}),
        ...(payload.lightingOnOffsetMin !== undefined
          ? { lightingOnOffsetMin: payload.lightingOnOffsetMin }
          : {}),
        ...(payload.lightingOffBufferMin !== undefined
          ? { lightingOffBufferMin: payload.lightingOffBufferMin }
          : {}),
        ...(payload.quietHoursEnabled !== undefined
          ? { quietHoursEnabled: payload.quietHoursEnabled }
          : {}),
        ...(payload.quietHoursStart !== undefined
          ? { quietHoursStart: payload.quietHoursStart }
          : {}),
        ...(payload.quietHoursEnd !== undefined
          ? { quietHoursEnd: payload.quietHoursEnd }
          : {}),
        ...(payload.quietHoursHardBlock !== undefined
          ? { quietHoursHardBlock: payload.quietHoursHardBlock }
          : {}),
      },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const rating = await this.databaseService.courtRating.aggregate({
      where: { courtId },
      _count: { _all: true },
      _avg: {
        courtScore: true,
        cleanlinessScore: true,
        lightingScore: true,
      },
    });

    const values = [
      Number(rating._avg.courtScore ?? 0),
      Number(rating._avg.cleanlinessScore ?? 0),
      Number(rating._avg.lightingScore ?? 0),
    ];

    return this.serializeCourt(updated, {
      average: Number(
        (
          values.reduce((acc, current) => acc + current, 0) /
          (values.filter(Boolean).length || 1)
        ).toFixed(2)
      ),
      count: rating._count._all,
    });
  }

  async deleteCourt(
    courtId: string,
    adminUserId: string
  ): Promise<{ success: boolean; message: string }> {
    await this.assertCourtExists(courtId);

    const now = new Date();

    const futureBookings = await this.databaseService.booking.findMany({
      where: {
        courtId,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
        startAt: {
          gt: now,
        },
      },
      include: {
        organizer: true,
      },
    });

    await this.databaseService.$transaction(async tx => {
      await tx.court.update({
        where: { id: courtId },
        data: {
          isActive: false,
          deletedAt: now,
        },
      });

      if (futureBookings.length > 0) {
        const ids = futureBookings.map(booking => booking.id);

        await tx.booking.updateMany({
          where: { id: { in: ids } },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: 'court_deleted',
          },
        });

        await tx.bookingStatusHistory.createMany({
          data: futureBookings.map(booking => ({
            bookingId: booking.id,
            fromStatus: booking.status,
            toStatus: BookingStatus.CANCELLED,
            reason: 'court_deleted',
            changedByUserId: adminUserId,
          })),
        });
      }
    });

    for (const booking of futureBookings) {
      await this.notifyUser(
        booking.organizer,
        'Court reservation cancelled',
        'Your booking was cancelled because the court was disabled by the admin.'
      );
    }

    return {
      success: true,
      message: 'court.success.deleted',
    };
  }

  async restoreCourt(
    courtId: string
  ): Promise<{ success: boolean; message: string }> {
    await this.assertCourtExists(courtId, true);

    await this.databaseService.court.update({
      where: { id: courtId },
      data: {
        deletedAt: null,
        isActive: true,
      },
    });

    return {
      success: true,
      message: 'court.success.restored',
    };
  }

  async createGalleryPresign(
    courtId: string,
    payload: CourtGalleryPresignRequestDto
  ): Promise<CourtGalleryPresignResponseDto> {
    await this.assertCourtExists(courtId);

    const bucket =
      this.configService.get<string>('AWS_S3_BUCKET') || 'tunduro-courts';
    const region =
      this.configService.get<string>('AWS_S3_REGION') || 'af-south-1';

    const sanitizedName = payload.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const key = `courts/${courtId}/${Date.now()}-${randomUUID()}-${sanitizedName}`;
    const fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    return {
      uploadUrl: `${fileUrl}?mockSigned=1&contentType=${encodeURIComponent(
        payload.contentType
      )}`,
      fileUrl,
      key,
      expiresInSeconds: 900,
    };
  }

  async replaceGallery(
    courtId: string,
    payload: CourtGalleryUpsertRequestDto
  ): Promise<CourtResponseDto> {
    await this.assertCourtExists(courtId);

    if (!Array.isArray(payload.images) || payload.images.length > 10) {
      throw new HttpException(
        'court.error.galleryLimitExceeded',
        HttpStatus.BAD_REQUEST
      );
    }

    const normalizedImages = payload.images.map((item, index) => ({
      url: item.url,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index,
    }));

    await this.databaseService.$transaction(async tx => {
      await tx.courtImage.deleteMany({ where: { courtId } });
      if (normalizedImages.length > 0) {
        await tx.courtImage.createMany({
          data: normalizedImages.map(item => ({
            courtId,
            url: item.url,
            sortOrder: item.sortOrder,
          })),
        });
      }
    });

    return this.getCourt(courtId);
  }

  async assertCourtIsBookable(courtId: string): Promise<Court> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    return court;
  }

  private async assertCourtExists(
    courtId: string,
    includeDeleted = false
  ): Promise<void> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: { id: true },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }
  }

  private toDate(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpException(
        `validation.error.invalid${field[0].toUpperCase()}${field.slice(1)}`,
        HttpStatus.BAD_REQUEST
      );
    }

    return parsed;
  }

  private getSlotRange(
    startAt?: string,
    endAt?: string,
    strict = true
  ): { startAt: Date; endAt: Date } | null {
    if (!startAt && !endAt) {
      return null;
    }

    if (!startAt || !endAt) {
      if (!strict) {
        return null;
      }
      throw new HttpException(
        'booking.error.slotRangeRequired',
        HttpStatus.BAD_REQUEST
      );
    }

    const start = this.toDate(startAt, 'startAt');
    const end = this.toDate(endAt, 'endAt');
    if (start >= end) {
      throw new HttpException(
        'booking.error.invalidTimeRange',
        HttpStatus.BAD_REQUEST
      );
    }

    return { startAt: start, endAt: end };
  }

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(Number(value));
  }

  private getSafePage(page?: number): number {
    const parsed = Number(page);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  private getSafePageSize(pageSize?: number, fallback = 10, max = 100): number {
    const parsed = Number(pageSize);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(parsed, max);
  }

  private serializeCourt(
    court: any,
    rating?: { average: number; count: number }
  ): CourtResponseDto {
    return {
      id: court.id,
      name: court.name,
      type: court.type,
      surface: court.surface,
      hasLighting: court.hasLighting,
      rules: court.rules ?? null,
      pricePerHour: Number(court.pricePerHour),
      currency: court.currency,
      maxPlayers: court.maxPlayers,
      isActive: court.isActive,
      lightingDeviceId: court.lightingDeviceId || [],
      lightingEnabled: court.lightingEnabled || false,
      lightingOnOffsetMin: court.lightingOnOffsetMin || 0,
      lightingOffBufferMin: court.lightingOffBufferMin || 0,
      quietHoursEnabled: court.quietHoursEnabled || false,
      quietHoursStart: court.quietHoursStart || '',
      quietHoursEnd: court.quietHoursEnd || '',
      quietHoursHardBlock: court.quietHoursHardBlock || false,
      ratingAverage: Number((rating?.average ?? 0).toFixed(2)),
      ratingCount: rating?.count ?? 0,
      images: (court.images ?? []).map((image: any) => ({
        id: image.id,
        url: image.url,
        sortOrder: image.sortOrder,
      })),
      createdAt: court.createdAt,
      updatedAt: court.updatedAt,
    };
  }

  private async notifyUser(
    user: {
      email: string;
      firstName?: string | null;
      expoPushToken?: string | null;
      notifyEmail?: boolean;
      notifyPush?: boolean;
    },
    subject: string,
    body: string
  ): Promise<void> {
    if (user.notifyEmail !== false && user.email) {
      await this.helperNotificationService.sendEmail({
        to: user.email,
        subject,
        text: body,
        html: `<p>${body}</p>`,
      });
    }

    if (user.notifyPush !== false && user.expoPushToken) {
      await this.helperNotificationService.sendPush({
        to: user.expoPushToken,
        title: subject,
        body,
      });
    }
  }
}
