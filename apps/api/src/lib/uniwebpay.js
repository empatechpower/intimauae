import crypto from 'crypto';

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = sortKeys(obj[k]);
      return acc;
    }, {});
}

/**
 * Sorted JSON body for Uniwebpay (keys A–Z).
 * `transactionId` is a 19-digit raw JSON number (never via JS Number(), which
 * loses precision). `clientTransactionId` stays a JSON string per Uniwebpay.
 */
export function sortedJson(body, { rawNumberKeys = ['transactionId'] } = {}) {
  const sorted = sortKeys(body);
  const raw = {};
  for (const k of rawNumberKeys) {
    if (sorted[k] == null || sorted[k] === '') continue;
    const asString = String(sorted[k]);
    // Non-numeric strings (e.g. "connectivity-check") stay quoted JSON strings
    if (!/^\d+$/.test(asString)) continue;
    raw[k] = asString;
    sorted[k] = `__RAWNUM_${k}__`;
  }
  let out = JSON.stringify(sorted);
  for (const [k, digits] of Object.entries(raw)) {
    out = out.replaceAll(`"__RAWNUM_${k}__"`, digits);
  }
  return out;
}

/** ISO-8601 to the second with +00:00 — no millis, no Z. */
export function formatRequestTime(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}:${s}+00:00`;
}

/**
 * Exact content to sign (two lines, one \\n, no trailing newline):
 * POST <path>
 * <StoreId>.<RequestTime>.<body>
 */
export function buildSignContent({ method = 'POST', path, storeId, requestTime, bodyString }) {
  return `${method} ${path}\n${String(storeId).trim()}.${requestTime}.${bodyString}`;
}

/** Normalize merchant private key to PEM Node can sign with. */
function toPem(pkcs8Base64) {
  const raw = String(pkcs8Base64 || '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  if (/BEGIN RSA PRIVATE KEY/.test(raw)) {
    return raw.replace(/\r\n/g, '\n');
  }
  if (/BEGIN PRIVATE KEY/.test(raw)) {
    return raw.replace(/\r\n/g, '\n');
  }

  const cleaned = raw
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const lines = cleaned.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

/**
 * SIG = URL-encode(standard Base64(SHA256withRSA(content)))
 * Not Base64URL; always URL-encode.
 */
export function signUniwebpayRequest({ method = 'POST', path, storeId, requestTime, bodyString, privateKeyPkcs8 }) {
  const content = buildSignContent({ method, path, storeId, requestTime, bodyString });
  const key = toPem(privateKeyPkcs8);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  const sigB64 = signer.sign(key).toString('base64');
  return encodeURIComponent(sigB64);
}

export function uniwebHeaders({ storeId, requestTime, signature, keyVersion = 1 }) {
  return {
    'Content-Type': 'application/json',
    'Store-Id': String(storeId).trim(),
    'Request-Time': requestTime,
    Signature: `algorithm=RSA256, keyVersion=${keyVersion}, signature=${signature}`
  };
}

/** Catalog amounts are SGD — convert to integer cents for Uniwebpay. */
export function aedToSgdCents(sgdAmount, _rateIgnored = 1) {
  return Math.max(1, Math.round(Number(sgdAmount || 0) * 100));
}

/** 19-digit clientTransactionId as a digit string (sent as raw JSON number). */
export function newClientTxnId() {
  const t = Date.now().toString();
  const r = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0');
  return (t + r).padEnd(19, '0').slice(0, 19);
}
