import { registerAs } from '@nestjs/config';

export default registerAs(
  'payment',
  (): Record<string, any> => ({
    paymentDeadlineMin: process.env.PAYMENT_DEADLINE_MIN
      ? Number.parseInt(process.env.PAYMENT_DEADLINE_MIN, 10)
      : 30,

    mpesa: {
      publicKey: process.env.MPESA_PUBLIC_KEY ?? '',
      apiKey: process.env.MPESA_API_KEY ?? '',
      host: process.env.MPESA_API_HOST ?? '',
      origin: process.env.MPESA_ORIGIN ?? '',
      serviceProviderCode: process.env.MPESA_SERVICE_PROVIDER_CODE ?? '',
      c2bPort: process.env.MPESA_C2B_PORT
        ? Number.parseInt(process.env.MPESA_C2B_PORT, 10)
        : 18352,
      requestTimeoutMs: process.env.MPESA_REQUEST_TIMEOUT_MS
        ? Number.parseInt(process.env.MPESA_REQUEST_TIMEOUT_MS, 10)
        : 110000,
    },
  })
);
