import { Injectable, BadRequestException } from '@nestjs/common';

import { IHelperPhoneService } from '../interfaces/phone.service.interface';

@Injectable()
export class HelperPhoneService implements IHelperPhoneService {
  private readonly COUNTRY_CODE = '258';
  private readonly VALID_PREFIXES = ['84', '85'];
  private readonly REQUIRED_LENGTH = 12;

  formatMpesaPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) {
      throw new BadRequestException('Phone number is required');
    }

    const digitsOnly = phoneNumber.replace(/\D/g, '');

    if (digitsOnly.length !== this.REQUIRED_LENGTH) {
      throw new BadRequestException(
        `Phone number must have ${this.REQUIRED_LENGTH} digits`
      );
    }

    if (!digitsOnly.startsWith(this.COUNTRY_CODE)) {
      throw new BadRequestException(
        `Phone number must start with ${this.COUNTRY_CODE}`
      );
    }

    const prefix = digitsOnly.substring(3, 5);
    if (!this.VALID_PREFIXES.includes(prefix)) {
      throw new BadRequestException(
        `Phone number prefix must be ${this.VALID_PREFIXES.join(' or ')}`
      );
    }

    return digitsOnly;
  }
}
