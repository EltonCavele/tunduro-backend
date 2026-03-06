import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { DatabaseService } from 'src/common/database/services/database.service';
import { UserNotificationPreferencesUpdateDto } from 'src/modules/user/dtos/request/user.notification-preferences.update.request';
import { UserUpdateDto } from 'src/modules/user/dtos/request/user.update.request';
import { UserService } from 'src/modules/user/services/user.service';

describe('UserService', () => {
  let service: UserService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: DatabaseService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateUser', () => {
    it('should throw an error if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUser('non-existent-id', { firstName: 'John' })
      ).rejects.toThrow(HttpException);
    });

    it('should update and return the user if user exists', async () => {
      const mockUser = { id: '123', firstName: 'John', lastName: 'Doe' };
      const updateDto: UserUpdateDto = { firstName: 'Jane' };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        ...updateDto,
      });

      const result = await service.updateUser('123', updateDto);

      expect(result).toEqual({
        ...mockUser,
        ...updateDto,
        avatarUrl: null,
        level: null,
        favoriteCourt: null,
        preferredTimeSlots: [],
        notifyPush: true,
        notifySms: true,
        notifyEmail: true,
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '123' },
        data: {
          ...updateDto,
          email: undefined,
          phone: undefined,
        },
      });
    });

    it('should throw conflict when email already exists on another user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '123',
        email: 'john@example.com',
        deletedAt: null,
      });
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'another-user',
        email: 'new@example.com',
      });

      await expect(
        service.updateUser('123', { email: 'new@example.com' })
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deleteUser', () => {
    it('should throw an error if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteUser('non-existent-id')).rejects.toThrow(
        HttpException
      );
    });

    it('should soft delete the user and return success message', async () => {
      const mockUser = { id: '123', firstName: 'John', lastName: 'Doe' };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      const result = await service.deleteUser('123');

      expect(result).toEqual({
        success: true,
        message: 'user.success.userDeleted',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '123' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('getProfile', () => {
    it('should throw an error if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        HttpException
      );
    });

    it('should return the user profile if user exists', async () => {
      const mockUser = { id: '123', firstName: 'John', lastName: 'Doe' };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('123');

      expect(result).toEqual({
        ...mockUser,
        avatarUrl: null,
        level: null,
        favoriteCourt: null,
        preferredTimeSlots: [],
        notifyPush: true,
        notifySms: true,
        notifyEmail: true,
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });
  });

  describe('getListOfUsers', () => {
    it('should return paginated users with default params', async () => {
      const users = [
        { id: 'u1', email: 'john@example.com' },
        { id: 'u2', email: 'jane@example.com' },
      ];

      mockPrismaService.user.count.mockResolvedValue(2);
      mockPrismaService.user.findMany.mockResolvedValue(users);

      const result = await service.getListOfUsers('self-user-id');

      expect(result).toEqual({
        items: [
          {
            id: 'u1',
            email: 'john@example.com',
            avatarUrl: null,
            level: null,
            favoriteCourt: null,
            preferredTimeSlots: [],
            notifyPush: true,
            notifySms: true,
            notifyEmail: true,
          },
          {
            id: 'u2',
            email: 'jane@example.com',
            avatarUrl: null,
            level: null,
            favoriteCourt: null,
            preferredTimeSlots: [],
            notifyPush: true,
            notifySms: true,
            notifyEmail: true,
          },
        ],
        metadata: {
          currentPage: 1,
          itemsPerPage: 10,
          totalItems: 2,
          totalPages: 1,
        },
      });
      expect(mockPrismaService.user.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          id: { not: 'self-user-id' },
        },
      });
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          id: { not: 'self-user-id' },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('should apply search and gender filters with page/pageSize', async () => {
      mockPrismaService.user.count.mockResolvedValue(7);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.getListOfUsers(
        'self-user-id',
        'john',
        2,
        5,
        undefined,
        undefined,
        'email',
        'asc',
        'male'
      );

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          id: { not: 'self-user-id' },
          gender: 'MALE',
          OR: [
            { firstName: { contains: 'john', mode: 'insensitive' } },
            { lastName: { contains: 'john', mode: 'insensitive' } },
            { phone: { contains: 'john', mode: 'insensitive' } },
            { email: { contains: 'john', mode: 'insensitive' } },
          ],
        },
        orderBy: { email: 'asc' },
        skip: 5,
        take: 5,
      });
    });

    it('should prioritize offset/limit over page/pageSize', async () => {
      mockPrismaService.user.count.mockResolvedValue(15);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.getListOfUsers(
        'self-user-id',
        undefined,
        1,
        10,
        8,
        4,
        'firstName',
        'desc',
        undefined
      );

      expect(result.metadata).toEqual({
        currentPage: 3,
        itemsPerPage: 4,
        totalItems: 15,
        totalPages: 4,
      });
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          id: { not: 'self-user-id' },
        },
        orderBy: { firstName: 'desc' },
        skip: 8,
        take: 4,
      });
    });

    it('should fallback to safe defaults for invalid sort and gender', async () => {
      mockPrismaService.user.count.mockResolvedValue(0);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.getListOfUsers(
        'self-user-id',
        'test',
        1,
        10,
        0,
        10,
        'invalidField',
        undefined,
        'invalidGender'
      );

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          id: { not: 'self-user-id' },
          OR: [
            { firstName: { contains: 'test', mode: 'insensitive' } },
            { lastName: { contains: 'test', mode: 'insensitive' } },
            { phone: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('notification preferences', () => {
    it('should return default notification preferences when user values are missing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        deletedAt: null,
      });

      const result = await service.getNotificationPreferences('user-id');

      expect(result).toEqual({
        notifyPush: true,
        notifySms: true,
        notifyEmail: true,
      });
    });

    it('should update notification preferences', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        deletedAt: null,
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-id',
        deletedAt: null,
        notifyPush: false,
        notifySms: true,
        notifyEmail: false,
      });

      const payload: UserNotificationPreferencesUpdateDto = {
        notifyPush: false,
        notifyEmail: false,
      };
      const result = await service.updateNotificationPreferences(
        'user-id',
        payload
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: {
          notifyPush: false,
          notifyEmail: false,
        },
      });
      expect(result).toEqual({
        notifyPush: false,
        notifySms: true,
        notifyEmail: false,
      });
    });
  });
});
