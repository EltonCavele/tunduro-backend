import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';

import { AuthService } from 'src/common/auth/services/auth.service';
import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperEncryptionService } from 'src/common/helper/services/helper.encryption.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockDatabaseService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userOtp: {
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockEncryptionService = {
    match: jest.fn(),
    createHash: jest.fn(),
    createJwtTokens: jest.fn(),
  };

  const mockNotificationService = {
    isPushEnabled: jest.fn(),
    isEmailEnabled: jest.fn(),
    sendPush: jest.fn(),
    sendEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: HelperEncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: HelperNotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockNotificationService.isPushEnabled.mockReturnValue(true);
    mockNotificationService.isEmailEnabled.mockReturnValue(true);
    mockNotificationService.sendPush.mockResolvedValue({
      success: true,
      provider: 'expo',
    });
    mockNotificationService.sendEmail.mockResolvedValue({
      success: true,
      provider: 'resend',
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should throw BAD_REQUEST when identifier is missing', async () => {
      await expect(
        service.login({
          password: 'Password1!',
        } as any)
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue(null);

      try {
        await service.login({
          identifier: 'john@example.com',
          password: 'Password1!',
        });
        fail('Expected login to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(error.message).toBe('user.error.userNotFound');
      }

      expect(mockDatabaseService.user.findFirst).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [{ email: 'john@example.com' }],
        },
      });
    });

    it('should throw BAD_REQUEST when password does not match', async () => {
      const user = {
        id: 'user-id',
        email: 'john@example.com',
        password: 'hashed-password',
        role: Role.USER,
        tokenVersion: 0,
      };
      mockDatabaseService.user.findFirst.mockResolvedValue(user);
      mockEncryptionService.match.mockResolvedValue(false);

      try {
        await service.login({
          identifier: 'john@example.com',
          password: 'Password1!',
        });
        fail('Expected login to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.message).toBe('auth.error.invalidPassword');
      }

      expect(mockEncryptionService.match).toHaveBeenCalledWith(
        'hashed-password',
        'Password1!'
      );
    });

    it('should return tokens and user when credentials are valid', async () => {
      const user = {
        id: 'user-id',
        email: 'john@example.com',
        password: 'hashed-password',
        role: Role.USER,
        tokenVersion: 3,
      };
      const tokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockDatabaseService.user.findFirst.mockResolvedValue(user);
      mockEncryptionService.match.mockResolvedValue(true);
      mockEncryptionService.createJwtTokens.mockResolvedValue(tokens);

      const result = await service.login({
        identifier: 'john@example.com',
        password: 'Password1!',
      });

      expect(mockEncryptionService.createJwtTokens).toHaveBeenCalledWith({
        role: Role.USER,
        userId: 'user-id',
        tokenVersion: 3,
      });
      expect(result).toEqual({
        ...tokens,
        user,
      });
    });

    it('should login with phone number', async () => {
      const user = {
        id: 'user-id',
        phone: '+258841234567',
        password: 'hashed-password',
        role: Role.USER,
        tokenVersion: 1,
      };
      mockDatabaseService.user.findFirst.mockResolvedValue(user);
      mockEncryptionService.match.mockResolvedValue(true);
      mockEncryptionService.createJwtTokens.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      await service.login({
        identifier: '+258841234567',
        password: 'Password1!',
      });

      expect(mockDatabaseService.user.findFirst).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [{ phone: '+258841234567' }],
        },
      });
    });
  });

  describe('signup', () => {
    it('should throw CONFLICT when email already exists', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue({
        id: 'existing-user',
        email: 'john@example.com',
      });

      try {
        await service.signup({
          email: 'john@example.com',
          password: 'Password1!',
        });
        fail('Expected signup to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(error.message).toBe('user.error.userExists');
      }
    });

    it('should throw CONFLICT when phone already exists', async () => {
      mockDatabaseService.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'existing-phone-user',
          phone: '+258841234567',
        });

      await expect(
        service.signup({
          email: 'john@example.com',
          password: 'Password1!',
          phone: '+258841234567',
        })
      ).rejects.toThrow(HttpException);
    });

    it('should create user and return tokens', async () => {
      const tokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };
      const createdUser = {
        id: 'new-user',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+258841234567',
        role: Role.USER,
        tokenVersion: 0,
      };

      mockDatabaseService.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockEncryptionService.createHash.mockResolvedValue('hashed-password');
      mockDatabaseService.user.create.mockResolvedValue(createdUser);
      mockDatabaseService.userOtp.deleteMany.mockResolvedValue({ count: 0 });
      mockDatabaseService.userOtp.create.mockResolvedValue({
        id: 'otp-id',
      });
      mockEncryptionService.createJwtTokens.mockResolvedValue(tokens);

      const result = await service.signup({
        email: 'john@example.com',
        password: 'Password1!',
        firstName: '  John  ',
        lastName: '  Doe  ',
        phone: '  +258841234567  ',
      });

      expect(mockEncryptionService.createHash).toHaveBeenCalledWith(
        'Password1!'
      );
      expect(mockDatabaseService.user.create).toHaveBeenCalledWith({
        data: {
          email: 'john@example.com',
          password: 'hashed-password',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+258841234567',
          gender: 'OTHER',
          role: Role.USER,
          tokenVersion: 0,
        },
      });
      expect(mockDatabaseService.userOtp.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'new-user',
          otp: expect.stringMatching(/^VERIFY_\d{6}$/),
          expiresAt: expect.any(Date),
        }),
      });
      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith({
        to: 'john@example.com',
        subject: 'Account Verification OTP',
        text: expect.stringContaining('Your verification code is:'),
        html: expect.stringContaining('Your verification code is:'),
      });
      expect(mockEncryptionService.createJwtTokens).toHaveBeenCalledWith({
        role: Role.USER,
        userId: 'new-user',
        tokenVersion: 0,
      });
      expect(result).toEqual({
        ...tokens,
        user: createdUser,
      });
    });
  });

  describe('refreshTokens', () => {
    it('should throw unauthorized when token version does not match', async () => {
      mockDatabaseService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        role: Role.USER,
        tokenVersion: 2,
      });

      await expect(
        service.refreshTokens({
          userId: 'user-id',
          role: Role.USER,
          tokenVersion: 1,
        })
      ).rejects.toThrow(HttpException);
    });

    it('should delegate token generation using payload', async () => {
      const payload = { userId: 'user-id', role: Role.ADMIN, tokenVersion: 4 };
      const tokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockDatabaseService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        role: Role.ADMIN,
        tokenVersion: 4,
      });
      mockEncryptionService.createJwtTokens.mockResolvedValue(tokens);

      const result = await service.refreshTokens(payload);

      expect(mockEncryptionService.createJwtTokens).toHaveBeenCalledWith({
        userId: 'user-id',
        role: Role.ADMIN,
        tokenVersion: 4,
      });
      expect(result).toEqual(tokens);
    });
  });

  describe('account verification', () => {
    it('should request verification OTP', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue({
        id: 'user-id',
        isVerified: false,
        email: 'john@example.com',
        deletedAt: null,
      });
      mockDatabaseService.userOtp.deleteMany.mockResolvedValue({ count: 0 });
      mockDatabaseService.userOtp.create.mockResolvedValue({ id: 'otp-id' });

      const result = await service.requestAccountVerificationOtp({
        identifier: 'john@example.com',
        channel: 'EMAIL',
      });

      expect(result).toEqual({
        success: true,
        message: 'auth.success.verification-otp-sent',
      });
      expect(mockDatabaseService.userOtp.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-id',
          otp: expect.stringMatching(/^VERIFY_\d{6}$/),
          expiresAt: expect.any(Date),
        }),
      });
      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith({
        to: 'john@example.com',
        subject: 'Account Verification OTP',
        text: expect.stringContaining('Your verification code is:'),
        html: expect.stringContaining('Your verification code is:'),
      });
    });

    it('should send verification OTP using expo push when SMS channel is requested and expo token exists', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue({
        id: 'user-id',
        isVerified: false,
        email: 'john@example.com',
        expoPushToken: 'ExponentPushToken[abcdef]',
        deletedAt: null,
      });
      mockDatabaseService.userOtp.deleteMany.mockResolvedValue({ count: 0 });
      mockDatabaseService.userOtp.create.mockResolvedValue({ id: 'otp-id' });

      await service.requestAccountVerificationOtp({
        identifier: 'john@example.com',
        channel: 'SMS',
      });

      expect(mockNotificationService.sendPush).toHaveBeenCalledWith({
        to: 'ExponentPushToken[abcdef]',
        title: 'Account Verification OTP',
        body: expect.stringContaining('Your verification code is:'),
        data: { type: 'otp', intent: 'verification' },
      });
    });

    it('should verify account with valid OTP', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue({
        id: 'user-id',
        isVerified: false,
        deletedAt: null,
      });
      mockDatabaseService.userOtp.findFirst.mockResolvedValue({
        id: 'otp-id',
      });
      mockDatabaseService.user.update.mockResolvedValue({
        id: 'user-id',
        isVerified: true,
      });
      mockDatabaseService.userOtp.delete.mockResolvedValue({ id: 'otp-id' });

      const result = await service.verifyAccountOtp({
        identifier: 'john@example.com',
        otp: '123456',
      });

      expect(mockDatabaseService.userOtp.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-id',
          otp: 'VERIFY_123456',
          expiresAt: {
            gt: expect.any(Date),
          },
        },
      });
      expect(result).toEqual({
        success: true,
        message: 'auth.success.account-verified',
      });
    });
  });

  describe('password reset', () => {
    it('should send password reset OTP when user exists', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue({
        id: 'user-id',
        email: 'john@example.com',
        deletedAt: null,
      });
      mockDatabaseService.userOtp.deleteMany.mockResolvedValue({ count: 0 });
      mockDatabaseService.userOtp.create.mockResolvedValue({ id: 'otp-id' });

      const result = await service.forgotPassword({
        identifier: 'john@example.com',
      });

      expect(result).toEqual({
        success: true,
        message: 'auth.success.password-reset-otp-sent',
      });
      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith({
        to: 'john@example.com',
        subject: 'Password Reset OTP',
        text: expect.stringContaining('Your password reset code is:'),
        html: expect.stringContaining('Your password reset code is:'),
      });
    });

    it('should return success even when user does not exist on forgot password', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword({
        identifier: 'unknown@example.com',
      });

      expect(result).toEqual({
        success: true,
        message: 'auth.success.password-reset-otp-sent',
      });
      expect(mockDatabaseService.userOtp.create).not.toHaveBeenCalled();
    });

    it('should reset password with valid OTP', async () => {
      mockDatabaseService.user.findFirst.mockResolvedValue({
        id: 'user-id',
        deletedAt: null,
      });
      mockDatabaseService.userOtp.findFirst.mockResolvedValue({
        id: 'otp-id',
      });
      mockEncryptionService.createHash.mockResolvedValue('new-hash');
      mockDatabaseService.user.update.mockResolvedValue({
        id: 'user-id',
      });
      mockDatabaseService.userOtp.delete.mockResolvedValue({ id: 'otp-id' });

      const result = await service.resetPassword({
        identifier: 'john@example.com',
        otp: '654321',
        newPassword: 'NewPassword1!',
      });

      expect(mockDatabaseService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: {
          password: 'new-hash',
          tokenVersion: {
            increment: 1,
          },
        },
      });
      expect(result).toEqual({
        success: true,
        message: 'auth.success.password-reset',
      });
    });
  });

  describe('logout all devices', () => {
    it('should increment tokenVersion and return success', async () => {
      mockDatabaseService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        deletedAt: null,
      });
      mockDatabaseService.user.update.mockResolvedValue({
        id: 'user-id',
        tokenVersion: 3,
      });

      const result = await service.logoutAllDevices({
        userId: 'user-id',
        role: Role.USER,
      });

      expect(mockDatabaseService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: {
          tokenVersion: {
            increment: 1,
          },
        },
      });
      expect(result).toEqual({
        success: true,
        message: 'auth.success.logout-all',
      });
    });
  });
});
