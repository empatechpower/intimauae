import crypto from 'crypto';

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = sortKeys(obj[k]);
      return acc;
    }, {});
}

/**
 * Sorted JSON body for Uniwebpay.
 * Large IDs (clientTransactionId) must appear as raw JSON numbers (19 digits),
 * not JS Number() — otherwise precision breaks and verify can fail.
 */
export function sortedJson(body, { rawNumberKeys = ['clientTransactionId'] } = {}) {
  const sorted = sortKeys(body);
  const raw = {};
  for (const k of rawNumberKeys) {
    if (sorted[k] == null || sorted[k] === '') continue;
    const digits = String(sorted[k]).replace(/\D/g, '');
    if (!digits) continue;
    raw[k] = digits;
    sorted[k] = `__RAWNUM_${k}__`;
  }
  let out = JSON.stringify(sorted);
  for (const [k, digits] of Object.entries(raw)) {
    out = out.replace(`"__RAWNUM_${k}__"`, digits);
  }
  return out;
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

  // Uniwebpay: PKCS8 single-line base64 (no PEM headers)
  const cleaned = raw.replace(/-----BEGIN[^-]+-----/g, '').replace(/-----END[^-]+-----/g, '').replace(/\s+/g, '');
  const lines = cleaned.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

/**
 * Content to sign: POST <path>\n<StoreId>.<RequestTime>.<body>
 * SIG = URL-encode(standard Base64(SHA256withRSA(content)))
 */
export function signUniwebpayRequest({ method = 'POST', path, storeId, requestTime, bodyString, privateKeyPkcs8 }) {
  const content = `${method} ${path}\n${storeId}.${requestTime}.${bodyString}`;
  const key = toPem(privateKeyPkcs8);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  const sigB64 = signer.sign(key).toString('base64');
  return encodeURIComponent(sigB64);
}

export function uniwebHeaders({ storeId, requestTime, signature, keyVersion = 1 }) {
  // Quick reference: spaces after commas in Signature
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
