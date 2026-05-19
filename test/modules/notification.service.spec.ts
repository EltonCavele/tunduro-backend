import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { DatabaseService } from 'src/common/database/services/database.service';
import { NotificationService } from 'src/modules/notification/services/notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  const mockPrismaService = {
    notification: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: DatabaseService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listUserNotifications', () => {
    it('should return paginated notifications for current user', async () => {
      const now = new Date();
      mockPrismaService.notification.count.mockResolvedValue(1);
      mockPrismaService.notification.findMany.mockResolvedValue([
        {
          id: 'n1',
          userId: 'u1',
          title: 'Title',
          body: 'Body',
          data: { type: 'booking' },
          readAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.listUserNotifications('u1', {
        page: 1,
        pageSize: 20,
        isRead: false,
      });

      expect(result.items).toHaveLength(1);
      expect(result.metadata.totalItems).toBe(1);
      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          readAt: null,
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('markAsRead', () => {
    it('should throw not found when notification is not owned by user', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead('u1', 'n1')).rejects.toThrow(
        HttpException
      );
    });

    it('should mark notification as read', async () => {
      const now = new Date();
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'n1',
        userId: 'u1',
        title: 'Title',
        body: 'Body',
        data: null,
        readAt: null,
        createdAt: now,
        updatedAt: now,
      });
      mockPrismaService.notification.update.mockResolvedValue({
        id: 'n1',
        userId: 'u1',
        title: 'Title',
        body: 'Body',
        data: null,
        readAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.markAsRead('u1', 'n1');

      expect(result.readAt).toEqual(now);
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('deleteNotification', () => {
    it('should delete only when notification belongs to user', async () => {
      mockPrismaService.notification.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteNotification('u1', 'n1');

      expect(result).toEqual({
        success: true,
        message: 'notification.success.deleted',
      });
      expect(mockPrismaService.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'u1' },
      });
    });
  });
});
