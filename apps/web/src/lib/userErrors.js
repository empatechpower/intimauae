/** Friendly storefront messages — never expose stack traces / config names. */

const FRIENDLY = {
  invalid_phone: 'Please enter a valid phone number.',
  otp_send_failed: 'We could not send a code right now. Please try again in a moment.',
  otp_invalid: 'That code is incorrect or expired. Please try again.',
  otp_needed: 'Please request a new code first.',
  no_account: 'No account found for this phone. Please register first.',
  phone_taken: 'This phone number is already registered. Please log in.',
  register_failed: 'We could not create your account. Please try again.',
  login_failed: 'Login failed. Please check your details and try again.',
  network: 'Connection problem. Please check your internet and try again.',
  generic: 'Something went wrong. Please try again.'
};

export function friendlyAuthError(error, fallbackKey = 'generic') {
  const raw = String(error?.message || error || '').toLowerCase();
  if (!raw) return FRIENDLY[fallbackKey];

  if (raw.includes('already registered') || raw.includes('phone already')) return FRIENDLY.phone_taken;
  if (raw.includes('no account')) return FRIENDLY.no_account;
  if (raw.includes('valid phone') || raw.includes('invalid phone')) return FRIENDLY.invalid_phone;
  if (raw.includes('request a new otp') || raw.includes('request a new code')) return FRIENDLY.otp_needed;
  if (
    raw.includes('code') &&
    (raw.includes('invalid') || raw.includes('expired') || raw.includes('incorrect'))
  ) {
    return FRIENDLY.otp_invalid;
  }
  if (raw.includes('too-many-requests') || raw.includes('quota')) {
    return 'Too many attempts. Please wait a bit and try again.';
  }
  if (raw.includes('network') || raw.includes('failed to fetch')) return FRIENDLY.network;
  if (raw.includes('firebase') || raw.includes('supabase') || raw.includes('configured')) {
    return FRIENDLY.generic;
  }
  if (raw.includes('server error') || raw.includes('internal')) return FRIENDLY.generic;

  // Short, safe-looking messages can pass through; long/technical ones get generic
  const original = String(error?.message || error || '').trim();
  if (original.length <= 120 && !/[{\\[\]}]/.test(original) && !original.includes('Error:')) {
    return original;
  }
  return FRIENDLY[fallbackKey];
}

export { FRIENDLY };
