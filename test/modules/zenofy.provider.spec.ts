import { PaymentMethod } from '@prisma/client';
import axios from 'axios';

import { ZenofyProvider } from 'src/modules/payment/providers/zenofy/zenofy.provider';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    isAxiosError: jest.fn(),
    post: jest.fn(),
  },
}));

describe('ZenofyProvider', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  function createProvider(config: Record<string, unknown> = {}) {
    return new ZenofyProvider({
      get: jest.fn((key: string) => config[key]),
    } as any);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (mockedAxios.isAxiosError as any).mockReturnValue(false);
  });

  it('creates a pending card order in Zenofy', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        checkout_id: 'checkout-1',
        checkout_url: 'https://pay.zenofy.io/c/checkout-1',
        expires_at: '2026-05-20T14:30:00.0000000Z',
      },
    });

    const provider = createProvider({
      'payment.zenofy.apiUrl': 'https://api.zenofy.test',
      'payment.zenofy.bookingProductId': 'product-1',
      'payment.zenofy.checkoutApiKey': 'api-key-1',
      'payment.zenofy.publicBaseUrl': 'https://api.tunduro.test',
    });

    const result = await provider.charge({
      amount: 1000,
      currency: 'MZN',
      customerEmail: 'client@example.com',
      customerName: 'Cliente Teste',
      method: PaymentMethod.CARD,
      phone: '+258841234567',
      reference: 'TUNDUROABC123',
      sessionId: 'session1',
      thirdPartyRef: 'session1',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.zenofy.test/checkout/order-api-gateway',
      expect.objectContaining({
        amount: 100000,
        customer: {
          email: 'client@example.com',
          name: 'Cliente Teste',
          phone: '+258841234567',
        },
        payment_methods: ['card'],
        productId: 'product-1',
        success_url:
          'https://api.tunduro.test/v1/payments/zenofy/return?sessionId=session1&reference=TUNDUROABC123',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Api-Key': 'api-key-1' }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        checkoutUrl: 'https://pay.zenofy.io/c/checkout-1',
        providerPaymentId: 'checkout-1',
        providerTransactionId: 'checkout-1',
        status: 'PENDING',
        success: true,
      })
    );
  });

  it('requires a valid customer phone for card checkout', async () => {
    const provider = createProvider({
      'payment.zenofy.bookingProductId': 'product-1',
      'payment.zenofy.checkoutApiKey': 'api-key-1',
    });

    const result = await provider.charge({
      amount: 1000,
      currency: 'MZN',
      customerEmail: 'client@example.com',
      customerName: 'Cliente Teste',
      method: PaymentMethod.CARD,
      reference: 'TUNDUROABC123',
      thirdPartyRef: 'session1',
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        providerMessage: 'payment.error.cardPhoneRequired',
        status: 'FAILED',
        success: false,
      })
    );
  });

  it('maps a paid Zenofy order to a completed payment result', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        currency: 'MZN',
        orderId: 'order-1',
        status: 'PAID',
        success: true,
        totalAmount: 1000,
      },
    });

    const provider = createProvider({
      'payment.zenofy.apiUrl': 'https://api.zenofy.test',
      'payment.zenofy.checkoutApiKey': 'api-key-1',
    });

    const result = await provider.getStatus({
      providerPaymentId: 'order-1',
      reference: 'TUNDUROABC123',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.zenofy.test/checkout/order-status',
      expect.objectContaining({
        params: { orderId: 'order-1' },
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        providerPaymentId: 'order-1',
        providerTransactionId: 'order-1',
        status: 'COMPLETED',
        success: true,
      })
    );
  });
});
