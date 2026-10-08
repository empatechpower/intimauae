/** Normalize to E.164. dialOrCountry can be "+971" or "AE". */
export function normalizePhone(input, dialOrCountry = '+971') {
  const raw = String(input || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('+')) {
    return `+${digits.slice(1).replace(/\D/g, '')}`;
  }
  const only = digits.replace(/\D/g, '');
  if (!only) return '';

  let dial = '+971';
  if (String(dialOrCountry).startsWith('+')) dial = String(dialOrCountry);
  else if (dialOrCountry === 'NG') dial = '+234';
  else if (dialOrCountry === 'AE') dial = '+971';

  const dialDigits = dial.replace(/\D/g, '');
  if (only.startsWith(dialDigits)) return `+${only}`;
  const national = only.startsWith('0') ? only.slice(1) : only;
  return `+${dialDigits}${national}`;
}

export function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
