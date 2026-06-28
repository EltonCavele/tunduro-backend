import { Role } from '@prisma/client';

export interface BookingPricedCourt {
  pricePerHour: unknown;
  memberPricePerHour: unknown;
  lightingPricePerHour: unknown;
  hasLighting: boolean;
  lightingDeviceId?: string[] | null;
}

export interface BookingPriceInput {
  court: BookingPricedCourt;
  durationMinutes: number;
  lightingRequested?: boolean | null;
  organizerRole?: Role | string | null;
}

export function canRequestBookingLighting(court: BookingPricedCourt): boolean {
  return (
    court.hasLighting &&
    Array.isArray(court.lightingDeviceId) &&
    court.lightingDeviceId.length > 0
  );
}

export function calculateBookingPrice(input: BookingPriceInput): number {
  const durationHours = input.durationMinutes / 60;
  const baseHourly =
    input.organizerRole === Role.MEMBER
      ? Number(input.court.memberPricePerHour)
      : Number(input.court.pricePerHour);
  const lightingHourly = input.lightingRequested
    ? Number(input.court.lightingPricePerHour)
    : 0;

  return Number(((baseHourly + lightingHourly) * durationHours).toFixed(2));
}
