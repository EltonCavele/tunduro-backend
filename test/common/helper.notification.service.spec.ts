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
    jest.clearAllMocks();
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
        'notification.resend.fromName': 'Tunduro',
      };
      return values[key];
    });
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      const values: Record<string, any> = {
        'notification.resend.apiKey': 'resend-key',
        'notification.resend.fromEmail': 'no-reply@tunduro.com',
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
});
