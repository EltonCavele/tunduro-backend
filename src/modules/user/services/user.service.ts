import { HttpStatus, Injectable, HttpException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { UserExpoPushTokenUpdateDto } from '../dtos/request/user.expo-push-token.update.request';
import { UserNotificationPreferencesUpdateDto } from '../dtos/request/user.notification-preferences.update.request';
import { UserUpdateDto } from '../dtos/request/user.update.request';
import {
  UserExpoPushTokenResponseDto,
  UserGetProfileResponseDto,
  UserNotificationPreferencesResponseDto,
  UserUpdateProfileResponseDto,
} from '../dtos/response/user.response';
import { IUserService } from '../interfaces/user.service.interface';

@Injectable()
export class UserService implements IUserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async updateUser(
    userId: string,
    data: UserUpdateDto
  ): Promise<UserUpdateProfileResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const normalizedEmail = data.email?.toLowerCase().trim();
    if (normalizedEmail) {
      const duplicatedEmail = await this.databaseService.user.findFirst({
        where: {
          email: normalizedEmail,
          id: { not: userId },
          deletedAt: null,
        },
      });
      if (duplicatedEmail) {
        throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
      }
    }

    const normalizedPhone = data.phone?.trim();
    if (normalizedPhone) {
      const duplicatedPhone = await this.databaseService.user.findFirst({
        where: {
          phone: normalizedPhone,
          id: { not: userId },
          deletedAt: null,
        },
      });
      if (duplicatedPhone) {
        throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
      }
    }

    const updatedUser = await this.databaseService.user.update({
      where: { id: userId },
      data: {
        ...data,
        email: normalizedEmail ?? data.email,
        phone: normalizedPhone ?? data.phone,
      } as any,
    });

    return this.normalizeUser(updatedUser) as UserUpdateProfileResponseDto;
  }

  async getNotificationPreferences(
    userId: string
  ): Promise<UserNotificationPreferencesResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    return this.getPreferencesFromUser(user);
  }

  async updateNotificationPreferences(
    userId: string,
    data: UserNotificationPreferencesUpdateDto
  ): Promise<UserNotificationPreferencesResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const updateData: Record<string, boolean> = {};
    if (typeof data.notifyPush === 'boolean') {
      updateData.notifyPush = data.notifyPush;
    }
    if (typeof data.notifySms === 'boolean') {
      updateData.notifySms = data.notifySms;
    }
    if (typeof data.notifyEmail === 'boolean') {
      updateData.notifyEmail = data.notifyEmail;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getPreferencesFromUser(user);
    }

    const updatedUser = await this.databaseService.user.update({
      where: { id: userId },
      data: updateData as any,
    });

    return this.getPreferencesFromUser(updatedUser);
  }

  async updateExpoPushToken(
    userId: string,
    data: UserExpoPushTokenUpdateDto
  ): Promise<UserExpoPushTokenResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const updated = await this.databaseService.user.update({
      where: { id: userId },
      data: { expoPushToken: data.expoPushToken },
    });

    return { expoPushToken: updated.expoPushToken as string };
  }

  async deleteUser(userId: string): Promise<ApiGenericResponseDto> {
    try {
      const user = await this.databaseService.user.findUnique({
        where: { id: userId },
      });
      if (!user) {
        throw new HttpException(
          'user.error.userNotFound',
          HttpStatus.NOT_FOUND
        );
      }
      await this.databaseService.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      return {
        success: true,
        message: 'user.success.userDeleted',
      };
    } catch (error) {
      throw error;
    }
  }

  async getProfile(id: string): Promise<UserGetProfileResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    return this.normalizeUser(user) as UserGetProfileResponseDto;
  }

  async getListOfUsers(
    userId: string,
    q?: string,
    page?: number,
    pageSize?: number,
    offset?: number,
    limit?: number,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    gender?: string
  ): Promise<ApiPaginatedDataDto<UserGetProfileResponseDto>> {
    const DEFAULT_PAGE = 1;
    const DEFAULT_PAGE_SIZE = 10;
    const MAX_PAGE_SIZE = 100;
    const DEFAULT_SORT_BY: keyof Prisma.UserOrderByWithRelationInput =
      'createdAt';
    const ALLOWED_SORT_FIELDS = new Set<
      keyof Prisma.UserOrderByWithRelationInput
    >([
      'firstName',
      'lastName',
      'phone',
      'email',
      'gender',
      'createdAt',
      'updatedAt',
    ]);

    const parsedPage = Number(page);
    const parsedPageSize = Number(pageSize);
    const parsedOffset = Number(offset);
    const parsedLimit = Number(limit);

    const safePage =
      Number.isInteger(parsedPage) && parsedPage > 0
        ? parsedPage
        : DEFAULT_PAGE;

    const safePageSize =
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const hasOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0;
    const hasLimit = Number.isInteger(parsedLimit) && parsedLimit > 0;
    const take = hasLimit ? Math.min(parsedLimit, MAX_PAGE_SIZE) : safePageSize;
    const skip = hasOffset ? parsedOffset : (safePage - 1) * take;
    const currentPage = hasOffset ? Math.floor(skip / take) + 1 : safePage;

    const safeSortField = ALLOWED_SORT_FIELDS.has(
      sortBy as keyof Prisma.UserOrderByWithRelationInput
    )
      ? (sortBy as keyof Prisma.UserOrderByWithRelationInput)
      : DEFAULT_SORT_BY;
    const safeSortOrder: Prisma.SortOrder =
      sortOrder === 'asc' ? 'asc' : 'desc';

    const searchQuery = q?.trim();
    const normalizedGender = gender?.trim().toUpperCase();
    const safeGender =
      normalizedGender &&
      Object.values($Enums.Gender).includes(normalizedGender as $Enums.Gender)
        ? (normalizedGender as $Enums.Gender)
        : undefined;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      id: { not: userId },
      ...(safeGender ? { gender: safeGender } : {}),
      ...(searchQuery
        ? {
            OR: [
              { firstName: { contains: searchQuery, mode: 'insensitive' } },
              { lastName: { contains: searchQuery, mode: 'insensitive' } },
              { phone: { contains: searchQuery, mode: 'insensitive' } },
              { email: { contains: searchQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalItems, users] = await Promise.all([
      this.databaseService.user.count({ where }),
      this.databaseService.user.findMany({
        where,
        orderBy: { [safeSortField]: safeSortOrder },
        skip,
        take,
      }),
    ]);

    return {
      items: users.map(user =>
        this.normalizeUser(user)
      ) as UserGetProfileResponseDto[],
      metadata: {
        currentPage,
        itemsPerPage: take,
        totalItems,
        totalPages: Math.ceil(totalItems / take),
      },
    };
  }

  private getPreferencesFromUser(
    user: Record<string, any>
  ): UserNotificationPreferencesResponseDto {
    return {
      notifyPush: typeof user.notifyPush === 'boolean' ? user.notifyPush : true,
      notifySms: typeof user.notifySms === 'boolean' ? user.notifySms : true,
      notifyEmail:
        typeof user.notifyEmail === 'boolean' ? user.notifyEmail : true,
    };
  }

  private normalizeUser<T extends Record<string, any>>(user: T): T {
    const { expoPushToken: _expoPushToken, ...safeUser } = user;
    return {
      ...safeUser,
      avatarUrl: safeUser.avatarUrl ?? null,
      level: safeUser.level ?? null,
      favoriteCourt: safeUser.favoriteCourt ?? null,
      preferredTimeSlots: Array.isArray(safeUser.preferredTimeSlots)
        ? safeUser.preferredTimeSlots
        : [],
      ...this.getPreferencesFromUser(user),
    } as unknown as T;
  }
}
