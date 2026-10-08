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
  captcha: 'Please complete the security check (reCAPTCHA), then try again.',
  firebase_setup: 'Phone login is not ready on this site yet. Please try again later.',
  generic: 'Something went wrong. Please try again.'
};

export function firebaseErrorCode(error) {
  return String(error?.code || error?.message || '')
    .toLowerCase()
    .replace(/^firebase:\s*/i, '')
    .trim();
}

export function friendlyAuthError(error, fallbackKey = 'generic') {
  const code = firebaseErrorCode(error);
  const raw = String(error?.message || error || '').toLowerCase();
  if (!raw && !code) return FRIENDLY[fallbackKey] || FRIENDLY.generic;

  if (code.includes('otp_send_failed') || raw === 'otp_send_failed') return FRIENDLY.otp_send_failed;
  if (code.includes('invalid_phone') || raw.includes('invalid_phone')) return FRIENDLY.invalid_phone;
  if (code.includes('otp_needed')) return FRIENDLY.otp_needed;
  if (code.includes('phone_taken') || raw.includes('already registered')) return FRIENDLY.phone_taken;
  if (code.includes('no account') || raw.includes('no account')) return FRIENDLY.no_account;

  if (code.includes('auth/invalid-phone-number') || code.includes('auth/missing-phone-number')) {
    return FRIENDLY.invalid_phone;
  }
  if (code.includes('auth/too-many-requests') || raw.includes('quota')) {
    return 'Too many attempts. Please wait a bit and try again.';
  }
  if (
    code.includes('auth/captcha-check-failed') ||
    code.includes('auth/invalid-recaptcha') ||
    code.includes('auth/missing-recaptcha') ||
    raw.includes('recaptcha')
  ) {
    return FRIENDLY.captcha;
  }
  if (code.includes('auth/billing-not-enabled')) {
    return 'SMS login is not enabled on the server yet (billing required). Please try again later.';
  }
  if (
    code.includes('auth/invalid-app-credential') ||
    code.includes('auth/app-not-authorized') ||
    code.includes('auth/unauthorized-domain') ||
    code.includes('auth/operation-not-allowed') ||
    code.includes('auth/admin-restricted-operation')
  ) {
    return FRIENDLY.firebase_setup;
  }
  if (code.includes('auth/code-expired') || code.includes('auth/invalid-verification-code')) {
    return FRIENDLY.otp_invalid;
  }
  if (raw.includes('network') || raw.includes('failed to fetch')) return FRIENDLY.network;

  // Prefer explicit fallback for send/verify flows instead of vague "something went wrong"
  if (fallbackKey && FRIENDLY[fallbackKey]) return FRIENDLY[fallbackKey];
  return FRIENDLY.generic;
}

export { FRIENDLY };
