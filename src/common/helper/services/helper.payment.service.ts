import { Injectable } from '@nestjs/common';

import { MessageService } from 'src/common/message/services/message.service';

import { IHelperPaymentService } from '../interfaces/payment.service.interface';

@Injectable()
export class HelperPaymentService implements IHelperPaymentService {
  constructor(private readonly messageService: MessageService) {}

  getMpesaErrorMessage(errorCode?: string): string {
    if (!errorCode) {
      return this.messageService.translate('payment.mpesa.error.default');
    }

    const translationKey = `payment.mpesa.error.${errorCode}`;
    const translatedMessage = this.messageService.translate(translationKey, {
      defaultValue: this.messageService.translate(
        'payment.mpesa.error.default'
      ),
    });

    return translatedMessage;
  }
}
