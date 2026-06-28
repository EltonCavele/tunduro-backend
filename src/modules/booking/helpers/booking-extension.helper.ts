import {
  CLUB_TIMEZONE,
  EXTENSION_DURATION_MINUTES,
} from '../constants/booking-extension.constants';

export function resolveExtensionWindow(bookingEndAt: Date, now: Date) {
  if (now < bookingEndAt) {
    const extensionStart = bookingEndAt;
    return {
      extensionStart,
      extensionEnd: new Date(
        extensionStart.getTime() + EXTENSION_DURATION_MINUTES * 60_000
      ),
    };
  }

  return {
    extensionStart: now,
    extensionEnd: new Date(
      now.getTime() + EXTENSION_DURATION_MINUTES * 60_000
    ),
  };
}

export function isExtensionEndWithinCourtHours(
  court: { quietHoursStart: string },
  extensionEnd: Date
): boolean {
  const closingTime = court.quietHoursStart || '22:00';
  const [closingHour, closingMinute] = closingTime.split(':').map(Number);
  const endParts = getClubDateTimeParts(extensionEnd);

  if (endParts.hour > closingHour) return false;
  if (endParts.hour === closingHour && endParts.minute > closingMinute) {
    return false;
  }

  return true;
}

function getClubDateTimeParts(value: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');

  return { hour, minute };
}
