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

export function sortedJson(body) {
  return JSON.stringify(sortKeys(body));
}

/** Normalize merchant private key to PEM Node can sign with. */
function toPem(pkcs8Base64) {
  const raw = String(pkcs8Base64 || '')
    .trim()
    // unwrap accidental JSON-string quotes from admin save
    .replace(/^"+|"+$/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  if (/BEGIN RSA PRIVATE KEY/.test(raw)) {
    return raw.replace(/\r\n/g, '\n');
  }
  if (/BEGIN PRIVATE KEY/.test(raw)) {
    return raw.replace(/\r\n/g, '\n');
  }

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
  return {
    'Content-Type': 'application/json',
    'Store-Id': String(storeId),
    'Request-Time': requestTime,
    Signature: `algorithm=RSA256, keyVersion=${keyVersion}, signature=${signature}`
  };
}

/** Catalog amounts are SGD — convert to integer cents for Uniwebpay. */
export function aedToSgdCents(sgdAmount, _rateIgnored = 1) {
  return Math.max(1, Math.round(Number(sgdAmount || 0) * 100));
}

export function newClientTxnId() {
  // Must stay within Number.MAX_SAFE_INTEGER — Uniwebpay body uses a JSON number.
  // Date.now() (13 digits) + 3 random digits = 16 digits, always safe.
  const t = Date.now().toString();
  const r = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${t}${r}`.slice(0, 16);
}
