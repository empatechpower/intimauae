/** Normalize to E.164. Default country: UAE (+971). */
export function normalizePhone(input, defaultCountry = 'AE') {
  const raw = String(input || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('+')) {
    return `+${digits.slice(1).replace(/\D/g, '')}`;
  }
  const only = digits.replace(/\D/g, '');
  if (defaultCountry === 'AE') {
    if (only.startsWith('971')) return `+${only}`;
    if (only.startsWith('0')) return `+971${only.slice(1)}`;
    return `+971${only}`;
  }
  return only ? `+${only}` : '';
}

export function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
