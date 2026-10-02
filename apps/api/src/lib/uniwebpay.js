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

/** PKCS8 single-line base64 private key -> PEM */
function toPem(pkcs8Base64) {
  const cleaned = String(pkcs8Base64 || '').replace(/-----BEGIN[^-]+-----/g, '').replace(/-----END[^-]+-----/g, '').replace(/\s+/g, '');
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
  signer.update(content);
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
  // 19-digit-ish numeric string for Uniwebpay
  const t = Date.now().toString();
  const r = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0');
  return (t + r).slice(0, 19);
}
