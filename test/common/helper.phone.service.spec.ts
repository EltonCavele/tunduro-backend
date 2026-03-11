import { BadRequestException } from '@nestjs/common';

import { HelperPhoneService } from 'src/common/helper/services/helper.phone.service';

describe('HelperPhoneService', () => {
  let service: HelperPhoneService;

  beforeEach(() => {
    service = new HelperPhoneService();
  });

  it('should format a valid mpesa phone number', () => {
    expect(service.formatMpesaPhoneNumber('+258 84 123 4567')).toBe(
      '258841234567'
    );
  });

  it('should throw when phone number is missing', () => {
    expect(() => service.formatMpesaPhoneNumber('')).toThrow(
      BadRequestException
    );
  });

  it('should throw when phone number length is invalid', () => {
    expect(() => service.formatMpesaPhoneNumber('25884123456')).toThrow(
      'Phone number must have 12 digits'
    );
  });

  it('should throw when country code is invalid', () => {
    expect(() => service.formatMpesaPhoneNumber('257841234567')).toThrow(
      'Phone number must start with 258'
    );
  });

  it('should throw when prefix is invalid', () => {
    expect(() => service.formatMpesaPhoneNumber('258861234567')).toThrow(
      'Phone number prefix must be 84 or 85'
    );
  });
});
