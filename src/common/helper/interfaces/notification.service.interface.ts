export interface ISendPushNotificationPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

export interface ISendEmailNotificationPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export interface INotificationDispatchResult {
  success: boolean;
  provider: 'expo' | 'resend';
  details?: Record<string, unknown>;
  error?: string;
}

export interface IHelperNotificationService {
  isPushEnabled(): boolean;
  isEmailEnabled(): boolean;
  sendPush(
    payload: ISendPushNotificationPayload
  ): Promise<INotificationDispatchResult>;
  sendEmail(
    payload: ISendEmailNotificationPayload
  ): Promise<INotificationDispatchResult>;
}
