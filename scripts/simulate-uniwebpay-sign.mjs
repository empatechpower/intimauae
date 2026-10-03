/**
 * Verify our signing matches Uniwebpay's published sample shape.
 * Does not require the real merchant key — uses a throwaway pair for padding checks.
 */
import crypto from 'crypto';
import { sortedJson, buildSignContent, signUniwebpayRequest } from '../apps/api/src/lib/uniwebpay.js';

const path = '/api/v1/payment/query';
const storeId = '1551614759571685376';
const requestTime = '2026-09-26T10:00:00+00:00';

const bodyString = sortedJson({
  clientTransactionId: 'connectivity-check',
  transactionId: '1000000000000000001'
});
const contentToSign = buildSignContent({ path, storeId, requestTime, bodyString });

const theirContent =
  'POST /api/v1/payment/query\n' +
  '1551614759571685376.2026-09-26T10:00:00+00:00.' +
  '{"clientTransactionId":"connectivity-check","transactionId":1000000000000000001}';

console.log('bodyString      :', bodyString);
console.log('contentMatches  :', contentToSign === theirContent);
console.log('byteLenOurs     :', Buffer.byteLength(contentToSign, 'utf8'));
console.log('byteLenTheirs   :', Buffer.byteLength(theirContent, 'utf8'));

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const sig = signUniwebpayRequest({ path, storeId, requestTime, bodyString, privateKeyPkcs8: pkcs8 });

const verifier = crypto.createVerify('RSA-SHA256');
verifier.update(contentToSign, 'utf8');
verifier.end();
console.log(
  'pkcs1v15 verify :',
  verifier.verify({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, decodeURIComponent(sig), 'base64')
);

console.log(
  'sample pay body :',
  sortedJson({
    acquirerType: 'CHECK_OUT_PAY',
    amount: 148400,
    cardToken: 'tok_sample',
    checkoutPaymentType: 'REGULAR',
    clientTransactionId: '1791029522875873487',
    currency: 'SGD'
  })
);
