import { Injectable } from '@nestjs/common';

const CLUB_TIMEZONE = 'Africa/Maputo';

@Injectable()
export class LightingPolicyService {
  isWithinQuietHours(
    date: Date,
    quietHoursStart: string,
    quietHoursEnd: string
  ): boolean {
    const currentMinutes = this.toTimezoneMinutes(date, CLUB_TIMEZONE);
    const startMinutes = this.toMinutes(quietHoursStart);
    const endMinutes = this.toMinutes(quietHoursEnd);

    if (startMinutes === endMinutes) {
      return true;
    }

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  hasBookingBeenPaid(totalPrice: number, paidAmount: number): boolean {
    return Number(paidAmount) >= Number(totalPrice);
  }

  private toMinutes(value: string): number {
    const [rawHour, rawMinute] = value.split(':');
    const hour = Number.parseInt(rawHour, 10);
    const minute = Number.parseInt(rawMinute, 10);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return 0;
    }

    return hour * 60 + minute;
  }

  private toTimezoneMinutes(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hourValue = parts.find(part => part.type === 'hour')?.value ?? '0';
    const minuteValue =
      parts.find(part => part.type === 'minute')?.value ?? '0';

    const hour = Number.parseInt(hourValue, 10);
    const minute = Number.parseInt(minuteValue, 10);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return 0;
    }

    return hour * 60 + minute;
  }
}
