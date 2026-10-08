/** Common dial codes for the storefront phone field */
export const DIAL_CODES = [
  { code: '+971', label: 'UAE (+971)', country: 'AE' },
  { code: '+234', label: 'Nigeria (+234)', country: 'NG' },
  { code: '+966', label: 'Saudi (+966)', country: 'SA' },
  { code: '+974', label: 'Qatar (+974)', country: 'QA' },
  { code: '+965', label: 'Kuwait (+965)', country: 'KW' },
  { code: '+973', label: 'Bahrain (+973)', country: 'BH' },
  { code: '+968', label: 'Oman (+968)', country: 'OM' },
  { code: '+1', label: 'US/CA (+1)', country: 'US' },
  { code: '+44', label: 'UK (+44)', country: 'GB' }
];

/**
 * Build E.164 from dial code + local number.
 * Local input may include a leading 0 (e.g. 0901… or 05…).
 */
export function normalizePhone(input, dialOrCountry = '+971') {
  const raw = String(input || '').trim();
  if (!raw) return '';

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;

  // Already international
  if (digits.startsWith('+')) {
    return `+${digits.slice(1).replace(/\D/g, '')}`;
  }

  const only = digits.replace(/\D/g, '');
  if (!only) return '';

  // dialOrCountry can be "+971" or "AE"
  let dial = '+971';
  if (String(dialOrCountry).startsWith('+')) {
    dial = String(dialOrCountry);
  } else {
    const found = DIAL_CODES.find((d) => d.country === dialOrCountry);
    if (found) dial = found.code;
  }

  const dialDigits = dial.replace(/\D/g, '');
  // If user typed country digits already (9715… / 23490…)
  if (only.startsWith(dialDigits)) return `+${only}`;

  // Drop trunk prefix 0 (0901… → 901…, 050… → 50…)
  const national = only.startsWith('0') ? only.slice(1) : only;
  return `+${dialDigits}${national}`;
}

export function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/** Split stored E.164 into dial + national for form fields (best effort). */
export function splitE164(e164) {
  const full = normalizePhone(e164, '+971');
  if (!full) return { dial: '+971', national: '' };
  const sorted = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const d of sorted) {
    if (full.startsWith(d.code)) {
      return { dial: d.code, national: full.slice(d.code.length) };
    }
  }
  return { dial: '+971', national: full.replace(/^\+/, '') };
}
