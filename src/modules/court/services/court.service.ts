import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  BookingCheckoutSessionStatus,
  BookingStatus,
  Court,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  CourtBookingsQueryRequestDto,
  CourtCreateRequestDto,
  CourtListQueryRequestDto,
  CourtUpdateRequestDto,
} from '../dtos/request/court.create.request';
import {
  CourtBookingAdminResponseDto,
  CourtBookingPublicResponseDto,
  CourtResponseDto,
} from '../dtos/response/court.response';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'courts');

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
  constructor(private readonly databaseService: DatabaseService) {}

  async listCourts(
    query: CourtListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<CourtResponseDto>> {
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Math.trunc(Number(query.pageSize)) || 10)
    );
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim();
    const surface = query.surface?.trim().toUpperCase();

    // Slot availability filter
    let slotFilter: Prisma.CourtWhereInput = {};
    if (query.startAt && query.endAt) {
      const start = new Date(query.startAt);
      const end = new Date(query.endAt);
      if (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        start < end
      ) {
        slotFilter = {
          NOT: {
            bookings: {
              some: {
                status: { in: BLOCKING_BOOKING_STATUSES },
                startAt: { lt: end },
                endAt: { gt: start },
              },
            },
          },
        };
      }
    }

    const where: Prisma.CourtWhereInput = {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(surface ? { surface } : {}),
      ...(typeof query.priceMin === 'number' ||
      typeof query.priceMax === 'number'
        ? {
            pricePerHour: {
              ...(typeof query.priceMin === 'number'
                ? { gte: new Prisma.Decimal(query.priceMin) }
                : {}),
              ...(typeof query.priceMax === 'number'
                ? { lte: new Prisma.Decimal(query.priceMax) }
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
      ...slotFilter,
    };

    const [totalItems, courts] = await Promise.all([
      this.databaseService.court.count({ where }),
      this.databaseService.court.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);

    return {
      items: courts.map(court => this.toResponse(court)),
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
      where: { id: courtId, deletedAt: null },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    return this.toResponse(court);
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

    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Math.trunc(Number(query.pageSize)) || 20)
    );

    const start = query.startAt ? new Date(query.startAt) : null;
    const end = query.endAt ? new Date(query.endAt) : null;

    if (start && Number.isNaN(start.getTime())) {
      throw new HttpException(
        'validation.error.invalidStartAt',
        HttpStatus.BAD_REQUEST
      );
    }
    if (end && Number.isNaN(end.getTime())) {
      throw new HttpException(
        'validation.error.invalidEndAt',
        HttpStatus.BAD_REQUEST
      );
    }

    const dateFilter =
      start || end
        ? {
            AND: [
              ...(start ? [{ endAt: { gte: start } }] : []),
              ...(end ? [{ startAt: { lte: end } }] : []),
            ],
          }
        : {};

    const where: Prisma.BookingWhereInput = { courtId, ...dateFilter };

    const checkoutSessionWhere: Prisma.BookingCheckoutSessionWhereInput = {
      courtId,
      status: { in: BLOCKING_CHECKOUT_SESSION_STATUSES },
      expiresAt: { gt: new Date() },
      ...dateFilter,
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
          include: { participants: { select: { userId: true } } },
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
          participantIds: item.participants.map(p => p.userId),
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
            ? item.participantUserIds.filter(id => typeof id === 'string')
            : [],
        } as CourtBookingAdminResponseDto;
      }),
    ]
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
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

  async createCourt(
    payload: CourtCreateRequestDto,
    files?: Express.Multer.File[]
  ): Promise<CourtResponseDto> {
    const imageUrls = files?.length ? this.saveFiles(files) : [];

    const court = await this.databaseService.court.create({
      data: {
        name: payload.name.trim(),
        type: payload.type,
        surface: payload.surface.trim().toUpperCase(),
        hasLighting: payload.hasLighting,
        rules: payload.rules?.trim() || null,
        pricePerHour: new Prisma.Decimal(payload.pricePerHour),
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
        ...(imageUrls.length > 0
          ? {
              images: {
                createMany: {
                  data: imageUrls.map((url, i) => ({
                    url,
                    sortOrder: i,
                  })),
                },
              },
            }
          : {}),
      },
    });

    return this.getCourt(court.id);
  }

  async updateCourt(
    courtId: string,
    payload: CourtUpdateRequestDto,
    files?: Express.Multer.File[]
  ): Promise<CourtResponseDto> {
    await this.assertCourtExists(courtId);

    const data: Prisma.CourtUpdateInput = {};

    if (payload.name !== undefined) data.name = payload.name.trim();
    if (payload.type !== undefined) data.type = payload.type;
    if (payload.surface !== undefined)
      data.surface = payload.surface.trim().toUpperCase();
    if (payload.hasLighting !== undefined)
      data.hasLighting = payload.hasLighting;
    if (payload.rules !== undefined) data.rules = payload.rules?.trim() || null;
    if (payload.pricePerHour !== undefined)
      data.pricePerHour = new Prisma.Decimal(payload.pricePerHour);
    if (payload.currency !== undefined)
      data.currency = payload.currency.trim().toUpperCase();
    if (payload.maxPlayers !== undefined) data.maxPlayers = payload.maxPlayers;
    if (payload.isActive !== undefined) data.isActive = payload.isActive;
    if (payload.lightingDeviceId !== undefined)
      data.lightingDeviceId = payload.lightingDeviceId;
    if (payload.lightingEnabled !== undefined)
      data.lightingEnabled = payload.lightingEnabled;
    if (payload.lightingOnOffsetMin !== undefined)
      data.lightingOnOffsetMin = payload.lightingOnOffsetMin;
    if (payload.lightingOffBufferMin !== undefined)
      data.lightingOffBufferMin = payload.lightingOffBufferMin;
    if (payload.quietHoursEnabled !== undefined)
      data.quietHoursEnabled = payload.quietHoursEnabled;
    if (payload.quietHoursStart !== undefined)
      data.quietHoursStart = payload.quietHoursStart;
    if (payload.quietHoursEnd !== undefined)
      data.quietHoursEnd = payload.quietHoursEnd;
    if (payload.quietHoursHardBlock !== undefined)
      data.quietHoursHardBlock = payload.quietHoursHardBlock;

    // If new images are uploaded, replace old ones
    if (files?.length) {
      const imageUrls = this.saveFiles(files);

      // Delete old image records
      const oldImages = await this.databaseService.courtImage.findMany({
        where: { courtId },
        select: { url: true },
      });
      for (const img of oldImages) {
        this.deleteLocalFile(img.url);
      }

      await this.databaseService.courtImage.deleteMany({
        where: { courtId },
      });

      data.images = {
        createMany: {
          data: imageUrls.map((url, i) => ({ url, sortOrder: i })),
        },
      };
    }

    await this.databaseService.court.update({
      where: { id: courtId },
      data,
    });

    return this.getCourt(courtId);
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
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        startAt: { gt: now },
      },
    });

    await this.databaseService.$transaction(async tx => {
      await tx.court.update({
        where: { id: courtId },
        data: { isActive: false, deletedAt: now },
      });

      if (futureBookings.length > 0) {
        const ids = futureBookings.map(b => b.id);

        await tx.booking.updateMany({
          where: { id: { in: ids } },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: 'court_deleted',
          },
        });

        await tx.bookingStatusHistory.createMany({
          data: futureBookings.map(b => ({
            bookingId: b.id,
            fromStatus: b.status,
            toStatus: BookingStatus.CANCELLED,
            reason: 'court_deleted',
            changedByUserId: adminUserId,
          })),
        });
      }
    });

    return { success: true, message: 'court.success.deleted' };
  }

  async assertCourtIsBookable(courtId: string): Promise<Court> {
    const court = await this.databaseService.court.findFirst({
      where: { id: courtId, deletedAt: null, isActive: true },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    return court;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async assertCourtExists(courtId: string): Promise<void> {
    const court = await this.databaseService.court.findFirst({
      where: { id: courtId, deletedAt: null },
      select: { id: true },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }
  }

  private saveFiles(files: Express.Multer.File[]): string[] {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    return files.map(file => {
      const ext = extname(file.originalname) || '.jpg';
      const filename = `${Date.now()}-${randomUUID()}${ext}`;
      const filepath = join(UPLOAD_DIR, filename);
      writeFileSync(filepath, file.buffer);
      return `/uploads/courts/${filename}`;
    });
  }

  private deleteLocalFile(url: string): void {
    try {
      const filepath = join(process.cwd(), url);
      if (existsSync(filepath)) {
        unlinkSync(filepath);
      }
    } catch {
      // Ignore file deletion errors
    }
  }

  private toResponse(court: any): CourtResponseDto {
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
      images: (court.images ?? []).map((img: any) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
      })),
      createdAt: court.createdAt,
      updatedAt: court.updatedAt,
    };
  }
}
