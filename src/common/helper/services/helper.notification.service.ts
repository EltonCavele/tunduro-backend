import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import {
  IHelperNotificationService,
  INotificationDispatchResult,
  ISendEmailNotificationPayload,
  ISendPushNotificationPayload,
} from '../interfaces/notification.service.interface';

@Injectable()
export class HelperNotificationService implements IHelperNotificationService {
  private readonly logger = new Logger(HelperNotificationService.name);

  constructor(private readonly configService: ConfigService) {}

  isPushEnabled(): boolean {
    return (
      this.configService.get<boolean>('notification.expo.enabled') === true
    );
  }

  isEmailEnabled(): boolean {
    return (
      this.configService.get<boolean>('notification.resend.enabled') === true &&
      Boolean(this.configService.get<string>('notification.resend.apiKey'))
    );
  }

  async sendPush(
    payload: ISendPushNotificationPayload
  ): Promise<INotificationDispatchResult> {
    if (!this.isPushEnabled()) {
      return {
        success: false,
        provider: 'expo',
        error: 'expo.push.disabled',
      };
    }

    const endpoint = this.configService.get<string>(
      'notification.expo.endpoint'
    );
    const accessToken = this.configService.get<string>(
      'notification.expo.accessToken'
    );

    try {
      const messages = this.normalizeRecipients(payload.to).map(token => ({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: payload.sound ?? 'default',
      }));

      const response = await axios.post(endpoint, messages, {
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
              }
            : {}),
        },
      });

      return {
        success: true,
        provider: 'expo',
        details: response.data,
      };
    } catch (error: any) {
      this.logger.error(`Expo push notification failed: ${error?.message}`);
      return {
        success: false,
        provider: 'expo',
        error: error?.message ?? 'expo.push.failed',
      };
    }
  }

  async sendEmail(
    payload: ISendEmailNotificationPayload
  ): Promise<INotificationDispatchResult> {
    if (!this.isEmailEnabled()) {
      return {
        success: false,
        provider: 'resend',
        error: 'resend.email.disabled',
      };
    }

    const apiKey = this.configService.getOrThrow<string>(
      'notification.resend.apiKey'
    );
    const fromEmail = this.configService.getOrThrow<string>(
      'notification.resend.fromEmail'
    );
    const fromName = this.configService.get<string>(
      'notification.resend.fromName'
    );
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    try {
      const response = await axios.post(
        'https://api.resend.com/emails',
        {
          from,
          to: this.normalizeRecipients(payload.to),
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        provider: 'resend',
        details: response.data,
      };
    } catch (error: any) {
      console.error(
        'Resend email error:',
        error?.response?.data ?? error?.message,
        error
      );
      this.logger.error(`Resend email failed: ${error?.message}`);
      return {
        success: false,
        provider: 'resend',
        error: error?.message ?? 'resend.email.failed',
      };
    }
  }

  private normalizeRecipients(value: string | string[]): string[] {
    return Array.isArray(value)
      ? value.map(item => item.trim()).filter(Boolean)
      : [value.trim()];
  }
}
