import crypto from 'crypto';
import { dbQuery, hasDatabaseUrl } from './db.js';

const KEY_MAP = {
  payment_uniwebpay_store_id: 'UNIWEBPAY_STORE_ID',
  payment_uniwebpay_private_key: 'UNIWEBPAY_PRIVATE_KEY_PKCS8',
  payment_uniwebpay_key_version: 'UNIWEBPAY_KEY_VERSION',
  payment_uniwebpay_base_url: 'UNIWEBPAY_BASE_URL',
  payment_uniwebpay_notify_url: 'UNIWEBPAY_NOTIFY_URL',
  payment_checkout_frames_pk: 'CHECKOUT_FRAMES_PK',
  usd_to_sgd_rate: 'USD_TO_SGD_RATE'
};

function asPlainString(value) {
  if (value == null) return '';
  // node-pg returns jsonb scalars as JS primitives; objects only if stored wrong
  if (typeof value === 'object') {
    if (typeof value.value === 'string') return asPlainString(value.value);
    try {
      return asPlainString(JSON.stringify(value));
    } catch {
      return '';
    }
  }
  if (typeof value === 'string') {
    let s = value.trim();
    // Unwrap accidental extra JSON quoting from older saves
    for (let i = 0; i < 2; i++) {
      if (!(s.startsWith('"') && s.endsWith('"'))) break;
      try {
        const parsed = JSON.parse(s);
        if (typeof parsed === 'string') s = parsed.trim();
        else break;
      } catch {
        break;
      }
    }
    return s.replace(/\\n/g, '\n').trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Normalize PKCS8 for OpenSSL (single-line base64 or PEM). */
export function normalizePrivateKeyPem(pkcs8Base64) {
  const raw = asPlainString(pkcs8Base64);
  if (!raw) return '';
  if (/BEGIN RSA PRIVATE KEY/.test(raw) || /BEGIN PRIVATE KEY/.test(raw)) {
    return raw.replace(/\r\n/g, '\n');
  }
  const cleaned = raw
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const lines = cleaned.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

export function applyPaymentSetting(key, value) {
  const envKey = KEY_MAP[key];
  if (!envKey) return;
  let str = asPlainString(value).trim();
  if (!str) return;
  if (envKey === 'UNIWEBPAY_PRIVATE_KEY_PKCS8') {
    // Store/use as compact PKCS8 base64 (strip PEM headers/whitespace)
    str = str
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/\s+/g, '');
  }
  process.env[envKey] = str;
  if (envKey === 'USD_TO_SGD_RATE') process.env.AED_TO_SGD_RATE = str;
}

export async function loadPaymentConfigFromDb() {
  if (!hasDatabaseUrl()) return;
  try {
    const { rows } = await dbQuery(
      `select key, value from public.settings where key = any($1::text[])`,
      [Object.keys(KEY_MAP)]
    );
    for (const r of rows) applyPaymentSetting(r.key, r.value);
  } catch (e) {
    console.warn('payment config load skipped:', e.message);
  }
}

/**
 * Safe diagnostics for Admin — never returns secret material.
 * Fingerprint = sha256 of SPKI public key derived from the private key.
 */
export function paymentConfiguredFlags() {
  const storeId = process.env.UNIWEBPAY_STORE_ID || '';
  const privateKey = process.env.UNIWEBPAY_PRIVATE_KEY_PKCS8 || '';
  const framesPk = process.env.CHECKOUT_FRAMES_PK || '';
  let privateKeyOk = false;
  let privateKeyError = null;
  let privateKeyFingerprint = null;
  let privateKeyBits = null;
  if (privateKey) {
    try {
      const pem = normalizePrivateKeyPem(privateKey);
      const keyObj = crypto.createPrivateKey(pem);
      const pubDer = crypto.createPublicKey(keyObj).export({ type: 'spki', format: 'der' });
      privateKeyFingerprint = crypto.createHash('sha256').update(pubDer).digest('hex').slice(0, 16);
      privateKeyBits = keyObj.asymmetricKeyDetails?.modulusLength || null;
      privateKeyOk = true;
    } catch (e) {
      privateKeyError = e.message || 'invalid private key';
    }
  }
  return {
    storeId: Boolean(storeId),
    storeIdValue: storeId || null,
    privateKey: Boolean(privateKey),
    privateKeyOk,
    privateKeyError,
    privateKeyFingerprint,
    privateKeyBits,
    privateKeyLength: privateKey ? privateKey.replace(/\s+/g, '').length : 0,
    framesPk: Boolean(framesPk),
    framesPkPrefix: framesPk ? String(framesPk).slice(0, 8) : null,
    baseUrl: Boolean(process.env.UNIWEBPAY_BASE_URL),
    baseUrlValue: process.env.UNIWEBPAY_BASE_URL || 'https://app.uniwebpay.com',
    notifyUrl: Boolean(process.env.UNIWEBPAY_NOTIFY_URL),
    notifyUrlValue: process.env.UNIWEBPAY_NOTIFY_URL || null,
    keyVersion: Boolean(process.env.UNIWEBPAY_KEY_VERSION),
    keyVersionValue: process.env.UNIWEBPAY_KEY_VERSION || '1',
    rate: Number(process.env.USD_TO_SGD_RATE || process.env.AED_TO_SGD_RATE || 1.35)
  };
}

export { KEY_MAP };
