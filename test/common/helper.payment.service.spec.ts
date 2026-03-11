import { Test, TestingModule } from '@nestjs/testing';

import { MessageService } from 'src/common/message/services/message.service';
import { HelperPaymentService } from 'src/common/helper/services/helper.payment.service';

describe('HelperPaymentService', () => {
  let service: HelperPaymentService;

  const messageServiceMock = {
    translate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelperPaymentService,
        {
          provide: MessageService,
          useValue: messageServiceMock,
        },
      ],
    }).compile();

    service = module.get<HelperPaymentService>(HelperPaymentService);
    jest.clearAllMocks();
  });

  it('should return default message when error code is missing', () => {
    messageServiceMock.translate.mockReturnValue('Default error');

    const result = service.getMpesaErrorMessage();

    expect(result).toBe('Default error');
    expect(messageServiceMock.translate).toHaveBeenCalledWith(
      'payment.mpesa.error.default'
    );
  });

  it('should return translated message when error code exists', () => {
    messageServiceMock.translate
      .mockReturnValueOnce('Default error')
      .mockReturnValueOnce('Specific error');

    const result = service.getMpesaErrorMessage('INSUFFICIENT_FUNDS');

    expect(result).toBe('Specific error');
  });
});
