import { registerAs } from '@nestjs/config';

export default registerAs('tuya', (): Record<string, any> => ({
  clientId: process.env.TUYA_CLIENT_ID ?? '',
  clientSecret: process.env.TUYA_CLIENT_SECRET ?? '',
  baseUrl: process.env.TUYA_BASE_URL ?? 'https://openapi.tuyaeu.com',
  requestTimeoutMs: process.env.TUYA_REQUEST_TIMEOUT_MS
    ? Number.parseInt(process.env.TUYA_REQUEST_TIMEOUT_MS, 10)
    : 10000,
  retryCount: process.env.TUYA_RETRY_COUNT
    ? Number.parseInt(process.env.TUYA_RETRY_COUNT, 10)
    : 3,
  retryBaseDelayMs: process.env.TUYA_RETRY_BASE_DELAY_MS
    ? Number.parseInt(process.env.TUYA_RETRY_BASE_DELAY_MS, 10)
    : 1000,
}));
