import { registerAs } from '@nestjs/config';

export default registerAs(
  'paysuite',
  (): Record<string, any> => ({
    apiBaseUrl: process.env.PAYSUITE_API_BASE_URL ?? 'https://paysuite.tech',
    apiToken: process.env.PAYSUITE_API_TOKEN ?? '',
    webhookSecret: process.env.PAYSUITE_WEBHOOK_SECRET ?? '',
    timeoutMs: process.env.PAYSUITE_TIMEOUT_MS
      ? Number.parseInt(process.env.PAYSUITE_TIMEOUT_MS, 10)
      : 10000,
    appPublicUrl: process.env.APP_PUBLIC_URL ?? '',
    mobileDeepLinkScheme: process.env.MOBILE_DEEP_LINK_SCHEME ?? 'myexpoapp',
  })
);
