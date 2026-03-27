import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';

describe('HelperNotificationService', () => {
  let service: HelperNotificationService;

  const mockConfigService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelperNotificationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<HelperNotificationService>(HelperNotificationService);
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should send push notification via expo endpoint', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.expo.enabled': true,
        'notification.expo.endpoint': 'https://exp.host/--/api/v2/push/send',
        'notification.expo.accessToken': 'expo-token',
      };
      return values[key];
    });

    const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { data: [{ status: 'ok' }] },
    } as any);

    const result = await service.sendPush({
      to: 'ExponentPushToken[abc]',
      title: 'Title',
      body: 'Body',
      data: { type: 'test' },
    });

    expect(axiosSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.provider).toBe('expo');
  });

  it('should send email via resend endpoint', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.resend.enabled': true,
        'notification.resend.apiKey': 'resend-key',
        'notification.resend.fromEmail': 'no-reply@tunduro.com',
        'notification.resend.fromName': 'Tunduro',
      };
      return values[key];
    });

    const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { id: 'email-id' },
    } as any);

    const result = await service.sendEmail({
      to: 'john@example.com',
      subject: 'Hello',
      text: 'Email body',
    });

    expect(axiosSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        from: 'Tunduro <no-reply@tunduro.com>',
        to: ['john@example.com'],
        subject: 'Hello',
        text: 'Email body',
      }),
      expect.any(Object)
    );
    expect(result.success).toBe(true);
    expect(result.provider).toBe('resend');
  });

  it('should return push disabled when expo is not enabled', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.expo.enabled': false,
      };
      return values[key];
    });

    const result = await service.sendPush({
      to: 'ExponentPushToken[abc]',
      title: 'Title',
      body: 'Body',
    });

    expect(result).toEqual({
      success: false,
      provider: 'expo',
      error: 'expo.push.disabled',
    });
  });

  it('should send push without authorization header when access token is missing', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.expo.enabled': true,
        'notification.expo.endpoint': 'https://exp.host/--/api/v2/push/send',
        'notification.expo.accessToken': undefined,
      };
      return values[key];
    });

    const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { data: [{ status: 'ok' }] },
    } as any);

    await service.sendPush({
      to: ['ExponentPushToken[abc]', 'ExponentPushToken[def]'],
      title: 'Title',
      body: 'Body',
    });

    expect(axiosSpy).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.any(Array),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      })
    );
  });

  it('should return push failure on axios error', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.expo.enabled': true,
        'notification.expo.endpoint': 'https://exp.host/--/api/v2/push/send',
        'notification.expo.accessToken': 'expo-token',
      };
      return values[key];
    });

    jest.spyOn(axios, 'post').mockRejectedValue(new Error('network error'));

    const result = await service.sendPush({
      to: 'ExponentPushToken[abc]',
      title: 'Title',
      body: 'Body',
    });

    expect(result).toEqual({
      success: false,
      provider: 'expo',
      error: 'network error',
    });
  });

  it('should return email disabled when resend is not configured', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.resend.enabled': false,
        'notification.resend.apiKey': '',
      };
      return values[key];
    });

    const result = await service.sendEmail({
      to: 'john@example.com',
      subject: 'Subject',
      text: 'Body',
    });

    expect(result).toEqual({
      success: false,
      provider: 'resend',
      error: 'resend.email.disabled',
    });
  });

  it('should fallback to fromEmail when fromName is missing', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.resend.enabled': true,
        'notification.resend.apiKey': 'resend-key',
        'notification.resend.fromEmail': 'no-reply@tunduro.com',
        'notification.resend.fromName': '',
      };
      return values[key];
    });

    const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { id: 'email-id' },
    } as any);

    await service.sendEmail({
      to: ['john@example.com', 'jane@example.com'],
      subject: 'Hello',
      html: '<p>Body</p>',
    });

    expect(axiosSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        from: 'no-reply@tunduro.com',
        to: ['john@example.com', 'jane@example.com'],
      }),
      expect.any(Object)
    );
  });

  it('should return email failure on resend error', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.resend.enabled': true,
        'notification.resend.apiKey': 'resend-key',
        'notification.resend.fromEmail': 'no-reply@tunduro.com',
        'notification.resend.fromName': 'Tunduro',
      };
      return values[key];
    });

    jest.spyOn(axios, 'post').mockRejectedValue(new Error('resend down'));

    const result = await service.sendEmail({
      to: 'john@example.com',
      subject: 'Hello',
      text: 'Body',
    });

    expect(result).toEqual({
      success: false,
      provider: 'resend',
      error: 'resend down',
    });
  });

  it('should return email failure when resend fromEmail is missing', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.resend.enabled': true,
        'notification.resend.apiKey': 'resend-key',
        'notification.resend.fromEmail': '',
        'notification.resend.fromName': 'Tunduro',
      };
      return values[key];
    });

    const result = await service.sendEmail({
      to: 'john@example.com',
      subject: 'Hello',
      text: 'Body',
    });

    expect(result).toEqual({
      success: false,
      provider: 'resend',
      error: 'resend.email.misconfigured',
    });
  });
});
