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
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function applyPaymentSetting(key, value) {
  const envKey = KEY_MAP[key];
  if (!envKey) return;
  const str = asPlainString(value).trim();
  if (!str) return;
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

export function paymentConfiguredFlags() {
  return {
    storeId: Boolean(process.env.UNIWEBPAY_STORE_ID),
    privateKey: Boolean(process.env.UNIWEBPAY_PRIVATE_KEY_PKCS8),
    framesPk: Boolean(process.env.CHECKOUT_FRAMES_PK),
    baseUrl: Boolean(process.env.UNIWEBPAY_BASE_URL),
    notifyUrl: Boolean(process.env.UNIWEBPAY_NOTIFY_URL),
    keyVersion: Boolean(process.env.UNIWEBPAY_KEY_VERSION),
    keyVersionValue: process.env.UNIWEBPAY_KEY_VERSION || '1',
    rate: Number(process.env.USD_TO_SGD_RATE || process.env.AED_TO_SGD_RATE || 1)
  };
}

export { KEY_MAP };
