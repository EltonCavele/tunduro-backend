import { registerAs } from '@nestjs/config';

export default registerAs(
  'payment',
  (): Record<string, any> => ({
    paymentDeadlineMin: process.env.PAYMENT_DEADLINE_MIN
      ? Number.parseInt(process.env.PAYMENT_DEADLINE_MIN, 10)
      : 30,

    paysuite: {
      apiUrl: process.env.PAYSUITE_API_URL ?? 'https://paysuite.tech/api/v1',
      apiToken: process.env.PAYSUITE_API_TOKEN ?? '',
      callbackUrl: process.env.PAYSUITE_CALLBACK_URL ?? '',
      publicBaseUrl: process.env.PAYSUITE_PUBLIC_BASE_URL ?? '',
      webhookSecret: process.env.PAYSUITE_WEBHOOK_SECRET ?? '',
      requestTimeoutMs: process.env.PAYSUITE_REQUEST_TIMEOUT_MS
        ? Number.parseInt(process.env.PAYSUITE_REQUEST_TIMEOUT_MS, 10)
        : 30000,
    },

    zenofy: {
      apiUrl: process.env.ZENOFY_API_URL ?? 'https://api.zenofy.io',
      bookingProductId: process.env.ZENOFY_BOOKING_PRODUCT_ID ?? '',
      checkoutApiKey: process.env.ZENOFY_CHECKOUT_API_KEY ?? '',
      publicBaseUrl: process.env.ZENOFY_PUBLIC_BASE_URL ?? '',
      requestTimeoutMs: process.env.ZENOFY_REQUEST_TIMEOUT_MS
        ? Number.parseInt(process.env.ZENOFY_REQUEST_TIMEOUT_MS, 10)
        : 30000,
      webhookSecret: process.env.ZENOFY_WEBHOOK_SECRET ?? '',
    },
  })
);
