import { COUNTRIES, DEFAULT_DIAL, DIAL_CODES } from './countries';

export { COUNTRIES, DEFAULT_DIAL, DIAL_CODES };

/**
 * Build E.164 from dial code + local number.
 * Local input may include a leading 0 (e.g. 0901… or 05…).
 */
export function normalizePhone(input, dialOrCountry = DEFAULT_DIAL) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;

  if (digits.startsWith('+')) {
    return `+${digits.slice(1).replace(/\D/g, '')}`;
  }

  const only = digits.replace(/\D/g, '');
  if (!only) return '';

  let dial = DEFAULT_DIAL;
  if (String(dialOrCountry).startsWith('+')) {
    dial = String(dialOrCountry);
  } else {
    const found = COUNTRIES.find((d) => d.iso === dialOrCountry);
    if (found) dial = found.code;
  }

  const dialDigits = dial.replace(/\D/g, '');
  if (only.startsWith(dialDigits)) return `+${only}`;

  const national = only.startsWith('0') ? only.slice(1) : only;
  return `+${dialDigits}${national}`;
}

export function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
