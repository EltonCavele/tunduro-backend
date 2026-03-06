import { registerAs } from '@nestjs/config';

export default registerAs('notification', (): Record<string, any> => ({
  expo: {
    enabled: process.env.EXPO_PUSH_ENABLED === 'true',
    endpoint:
      process.env.EXPO_PUSH_ENDPOINT ?? 'https://exp.host/--/api/v2/push/send',
    accessToken: process.env.EXPO_ACCESS_TOKEN,
  },
  resend: {
    enabled: process.env.RESEND_ENABLED === 'true',
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    fromName: process.env.RESEND_FROM_NAME ?? 'Tunduro',
  },
}));
