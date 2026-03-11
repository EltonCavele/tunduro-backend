import { LightingPolicyService } from 'src/modules/lighting/services/lighting.policy.service';

describe('LightingPolicyService', () => {
  let service: LightingPolicyService;

  beforeEach(() => {
    service = new LightingPolicyService();
  });

  it('should detect overnight quiet hours windows', () => {
    const duringQuiet = new Date('2026-03-11T23:10:00.000Z');
    const outsideQuiet = new Date('2026-03-11T12:10:00.000Z');

    expect(service.isWithinQuietHours(duringQuiet, '22:00', '06:00')).toBe(
      true
    );
    expect(service.isWithinQuietHours(outsideQuiet, '22:00', '06:00')).toBe(
      false
    );
  });

  it('should evaluate payment completion against total price', () => {
    expect(service.hasBookingBeenPaid(1000, 1000)).toBe(true);
    expect(service.hasBookingBeenPaid(1000, 1200)).toBe(true);
    expect(service.hasBookingBeenPaid(1000, 999.99)).toBe(false);
  });
});
