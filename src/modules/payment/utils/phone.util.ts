/**
 * Normalises a Mozambican mobile number into the canonical M-Pesa MSISDN
 * format `258XXXXXXXXX` (12 digits, no `+`). Returns null if the number is
 * not a valid Mozambican mobile (operator prefixes 82-87).
 */
export function normalizeMozMsisdn(input: string | undefined | null): string | null {
  if (!input) return null;
  const digits = String(input).replace(/[^\d]/g, '');

  let local: string;
  if (digits.length === 12 && digits.startsWith('258')) {
    local = digits.slice(3);
  } else if (digits.length === 9) {
    local = digits;
  } else if (digits.length === 11 && digits.startsWith('25')) {
    local = digits.slice(2);
  } else {
    return null;
  }

  if (!/^8[2-7]\d{7}$/.test(local)) {
    return null;
  }

  return `258${local}`;
}
