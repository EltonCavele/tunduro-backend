import { Role } from '@prisma/client';

import {
  calculateBookingPrice,
  canRequestBookingLighting,
} from 'src/modules/booking/helpers/booking-pricing.helper';

const baseCourt = {
  pricePerHour: 1000,
  memberPricePerHour: 700,
  lightingPricePerHour: 200,
  hasLighting: true,
  lightingEnabled: true,
  lightingDeviceId: ['device-1'],
};

describe('booking pricing helper', () => {
  it('calculates non-member price without lighting', () => {
    expect(
      calculateBookingPrice({
        court: baseCourt,
        durationMinutes: 120,
        lightingRequested: false,
        organizerRole: Role.USER,
      })
    ).toBe(2000);
  });

  it('calculates member price without lighting', () => {
    expect(
      calculateBookingPrice({
        court: baseCourt,
        durationMinutes: 120,
        lightingRequested: false,
        organizerRole: Role.MEMBER,
      })
    ).toBe(1400);
  });

  it('adds lighting price per hour when requested', () => {
    expect(
      calculateBookingPrice({
        court: baseCourt,
        durationMinutes: 90,
        lightingRequested: true,
        organizerRole: Role.MEMBER,
      })
    ).toBe(1350);
  });

  it('rejects lighting when the court has no enabled lighting device', () => {
    expect(
      canRequestBookingLighting({
        ...baseCourt,
        lightingDeviceId: [],
      })
    ).toBe(false);
  });
});
