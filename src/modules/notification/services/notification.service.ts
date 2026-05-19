import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { NotificationListQueryDto } from '../dtos/request/notification.list.request';
import { NotificationResponseDto } from '../dtos/response/notification.response';

interface CreateNotificationInput {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  constructor(private readonly db: DatabaseService) {}

  async listUserNotifications(
    userId: string,
    query: NotificationListQueryDto
  ): Promise<ApiPaginatedDataDto<NotificationResponseDto>> {
    const page = Math.max(1, query.page || 1);
    const take = Math.min(100, query.pageSize || 20);

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(typeof query.isRead === 'boolean'
        ? query.isRead
          ? { readAt: { not: null } }
          : { readAt: null }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.db.notification.count({ where }),
      this.db.notification.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: items.map(item => this.map(item)),
      metadata: {
        currentPage: page,
        itemsPerPage: take,
        totalItems: total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async markAsRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationResponseDto> {
    const notification = await this.db.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new HttpException(
        'notification.error.notFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (notification.readAt) {
      return this.map(notification);
    }

    const updated = await this.db.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return this.map(updated);
  }

  async deleteNotification(
    userId: string,
    notificationId: string
  ): Promise<ApiGenericResponseDto> {
    const deleted = await this.db.notification.deleteMany({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (deleted.count === 0) {
      throw new HttpException(
        'notification.error.notFound',
        HttpStatus.NOT_FOUND
      );
    }

    return {
      success: true,
      message: 'notification.success.deleted',
    };
  }

  async createForUser(input: CreateNotificationInput): Promise<void> {
    await this.db.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        body: input.body,
        data: input.data
          ? (input.data as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  private map(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      data: (notification.data as Record<string, unknown> | null) ?? null,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}
