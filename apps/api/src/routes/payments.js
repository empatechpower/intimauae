import { Router } from 'express';
import { getSupabaseAdmin, hasServiceRole, requireUser } from '../lib/supabase.js';
import {
  aedToSgdCents,
  newClientTxnId,
  signUniwebpayRequest,
  sortedJson,
  uniwebHeaders,
  formatRequestTime,
  buildSignContent
} from '../lib/uniwebpay.js';
import { memGetOrder, memGetPayment, memUpsertPayment, memoryEnabled } from '../lib/memoryStore.js';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';
import { loadPaymentConfigFromDb } from '../lib/paymentConfig.js';
import { writeAudit } from '../lib/audit.js';

export const paymentsRouter = Router();

const USER_ERROR = 'Something went wrong. Please try again or contact support.';

function extractRedirect(provider) {
  if (!provider || typeof provider !== 'object') return null;
  return (
    provider.redirectUrl ||
    provider.checkoutUrl ||
    provider.url ||
    provider.paymentUrl ||
    provider.data?.redirectUrl ||
    provider.data?.checkoutUrl ||
    provider.data?.url ||
    provider.result?.redirectUrl ||
    provider.result?.checkoutUrl ||
    null
  );
}

paymentsRouter.get('/config', async (_req, res) => {
  try {
    await loadPaymentConfigFromDb();
  } catch {
    /* ignore */
  }
  res.json({
    currency: 'SGD',
    displayCurrency: 'SGD',
    checkoutFramesPk: process.env.CHECKOUT_FRAMES_PK || null,
    ready: Boolean(process.env.UNIWEBPAY_PRIVATE_KEY_PKCS8 && process.env.CHECKOUT_FRAMES_PK && process.env.UNIWEBPAY_STORE_ID)
  });
});

paymentsRouter.post('/create', async (req, res, next) => {
  try {
    try {
      await requireUser(req);
    } catch {
      /* guest */
    }

    await loadPaymentConfigFromDb();

    const { orderId, cardToken, successUrl, failUrl } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: USER_ERROR });
    }
    if (!cardToken) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'missing_card_token',
        message: 'CHECK_OUT_PAY requires a Checkout Frames cardToken from the browser',
        detail: { orderId },
        orderId
      });
      return res.status(400).json({ error: 'Card details are required. Please enter your card and try again.' });
    }

    const apiUrl = process.env.API_URL || 'http://127.0.0.1:4123';
    const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
    const usePg = hasDatabaseUrl();
    const useMemory = !usePg && (memoryEnabled() || !hasServiceRole());

    const storeId = process.env.UNIWEBPAY_STORE_ID;
    const privateKey = process.env.UNIWEBPAY_PRIVATE_KEY_PKCS8;
    const framesPk = process.env.CHECKOUT_FRAMES_PK;
    const missing = [];
    if (!storeId) missing.push('storeId');
    if (!privateKey) missing.push('privateKey');
    if (!framesPk) missing.push('framesPk');

    if (missing.length) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'payment_config_incomplete',
        message: `Checkout blocked — missing: ${missing.join(', ')}`,
        detail: { missing, orderId },
        orderId
      });
      return res.status(503).json({ error: USER_ERROR });
    }

    let order;
    if (usePg) {
      const { rows } = await dbQuery(`select * from public.orders where id = $1`, [orderId]);
      order = rows[0] || null;
    } else if (useMemory) {
      order = memGetOrder(orderId);
    } else {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (error) throw error;
      order = data;
    }
    if (!order) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'order_not_found',
        message: 'Payment attempted for unknown order',
        detail: { orderId },
        orderId
      });
      return res.status(404).json({ error: USER_ERROR });
    }

    const amount = order.charge_sgd_cents || aedToSgdCents(order.total_aed, 1);
    const clientTransactionId = newClientTxnId();

    const body = {
      acquirerType: 'CHECK_OUT_PAY',
      amount: Number(amount),
      cardToken: cardToken || undefined,
      checkoutPaymentType: 'REGULAR',
      clientTransactionId: String(clientTransactionId),
      currency: 'SGD',
      failUrl: failUrl || `${appUrl}/checkout?status=fail&order=${orderId}`,
      notificationUrl: process.env.UNIWEBPAY_NOTIFY_URL || `${apiUrl}/api/payments/webhook`,
      successUrl: successUrl || `${appUrl}/checkout?status=success&order=${orderId}`
    };
    if (!body.cardToken) delete body.cardToken;

    const bodyString = sortedJson(body);
    const path = '/api/v1/payment/pay';
    const requestTime = formatRequestTime();
    const contentToSign = buildSignContent({ path, storeId, requestTime, bodyString });

    if (usePg) {
      await dbQuery(
        `insert into public.payments (order_id, client_transaction_id, status, amount_sgd_cents, card_token, provider_payload)
         values ($1,$2,'pending',$3,$4,$5::jsonb)
         on conflict (client_transaction_id) do update set status='pending', provider_payload=excluded.provider_payload`,
        [
          orderId,
          String(clientTransactionId),
          amount,
          cardToken || null,
          JSON.stringify({ requestBody: bodyString, contentToSign })
        ]
      );
    } else if (useMemory) {
      memUpsertPayment(clientTransactionId, {
        order_id: orderId,
        status: 'pending',
        amount_sgd_cents: amount,
        card_token: cardToken || null,
        provider_payload: { requestBody: bodyString, contentToSign }
      });
    } else {
      const sb = getSupabaseAdmin();
      await sb.from('payments').upsert(
        {
          order_id: orderId,
          client_transaction_id: String(clientTransactionId),
          status: 'pending',
          amount_sgd_cents: amount,
          card_token: cardToken || null,
          provider_payload: { requestBody: bodyString, contentToSign }
        },
        { onConflict: 'client_transaction_id' }
      );
    }

    let signature;
    try {
      signature = signUniwebpayRequest({
        path,
        storeId,
        requestTime,
        bodyString,
        privateKeyPkcs8: privateKey
      });
    } catch (signErr) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'sign_failed',
        message: signErr.message || 'Failed to sign Uniwebpay request (check private key format)',
        detail: { orderId, clientTransactionId: String(clientTransactionId), requestBody: bodyString, contentToSign },
        orderId
      });
      return res.status(503).json({ error: USER_ERROR });
    }

    const headers = uniwebHeaders({
      storeId,
      requestTime,
      signature,
      keyVersion: Number(process.env.UNIWEBPAY_KEY_VERSION || 1)
    });

    const base = process.env.UNIWEBPAY_BASE_URL || 'https://app.uniwebpay.com';
    let resp;
    let raw;
    let json;
    try {
      resp = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: bodyString
      });
      raw = await resp.text();
      try {
        json = JSON.parse(raw);
      } catch {
        json = { raw };
      }
    } catch (netErr) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'provider_network_error',
        message: netErr.message || 'Network error calling Uniwebpay',
        detail: { orderId, clientTransactionId: String(clientTransactionId), base, requestBody: bodyString, contentToSign },
        orderId
      });
      return res.status(502).json({ error: USER_ERROR });
    }

    const redirectUrl = extractRedirect(json);
    const providerOk = resp.ok && (json?.success !== false);

    if (usePg) {
      await dbQuery(
        `update public.payments set provider_payload=$2::jsonb, status=$3, updated_at=now() where client_transaction_id=$1`,
        [
          String(clientTransactionId),
          JSON.stringify({
            requestBody: bodyString,
            contentToSign,
            headers: {
              'Store-Id': headers['Store-Id'],
              'Request-Time': headers['Request-Time'],
              Signature: headers.Signature
            },
            response: json
          }),
          providerOk ? 'pending' : 'failed'
        ]
      );
    } else if (useMemory) {
      memUpsertPayment(clientTransactionId, {
        provider_payload: { requestBody: bodyString, contentToSign, response: json },
        status: providerOk ? 'pending' : 'failed'
      });
    } else {
      const sb = getSupabaseAdmin();
      await sb
        .from('payments')
        .update({
          provider_payload: { requestBody: bodyString, contentToSign, response: json },
          status: providerOk ? 'pending' : 'failed'
        })
        .eq('client_transaction_id', String(clientTransactionId));
    }

    if (!providerOk || (!redirectUrl && !cardToken)) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'provider_rejected',
        message: json?.message || json?.error || `Uniwebpay returned HTTP ${resp.status}`,
        detail: {
          orderId,
          clientTransactionId: String(clientTransactionId),
          httpStatus: resp.status,
          hasRedirect: Boolean(redirectUrl),
          hasCardToken: Boolean(cardToken),
          requestBody: bodyString,
          contentToSign,
          headers: {
            'Store-Id': headers['Store-Id'],
            'Request-Time': headers['Request-Time'],
            Signature: headers.Signature
          },
          provider: json
        },
        orderId
      });
      return res.status(502).json({ error: USER_ERROR });
    }

    await writeAudit({
      level: 'info',
      source: 'payments',
      event: 'payment_started',
      message: redirectUrl ? 'Customer redirected to Uniwebpay checkout' : 'Payment request accepted',
      detail: { orderId, clientTransactionId: String(clientTransactionId), hasRedirect: Boolean(redirectUrl) },
      orderId
    });

    res.json({
      ok: true,
      clientTransactionId: String(clientTransactionId),
      redirectUrl: redirectUrl || undefined
    });
  } catch (e) {
    await writeAudit({
      level: 'error',
      source: 'payments',
      event: 'payment_exception',
      message: e.message || 'Unhandled payment error',
      detail: { stack: e.stack }
    });
    res.status(500).json({ error: USER_ERROR });
  }
});

paymentsRouter.post('/query', async (req, res, next) => {
  try {
    await loadPaymentConfigFromDb();
    const clientTransactionId = req.body?.clientTransactionId;
    if (!clientTransactionId) return res.status(400).json({ error: USER_ERROR });
    const privateKey = process.env.UNIWEBPAY_PRIVATE_KEY_PKCS8;
    if (!privateKey) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'query_config_incomplete',
        message: 'Payment query blocked — private key missing',
        detail: { clientTransactionId: String(clientTransactionId) }
      });
      return res.status(503).json({ error: USER_ERROR });
    }

    const path = '/api/v1/payment/query';
    const body = { clientTransactionId: String(clientTransactionId) };
    const bodyString = sortedJson(body);
    const requestTime = formatRequestTime();
    const storeId = process.env.UNIWEBPAY_STORE_ID;
    const signature = signUniwebpayRequest({
      path,
      storeId,
      requestTime,
      bodyString,
      privateKeyPkcs8: privateKey
    });
    const headers = uniwebHeaders({
      storeId,
      requestTime,
      signature,
      keyVersion: Number(process.env.UNIWEBPAY_KEY_VERSION || 1)
    });
    const base = process.env.UNIWEBPAY_BASE_URL || 'https://app.uniwebpay.com';
    const resp = await fetch(`${base}${path}`, { method: 'POST', headers, body: bodyString });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'query_failed',
        message: json?.message || `Query HTTP ${resp.status}`,
        detail: { clientTransactionId: String(clientTransactionId), provider: json }
      });
      return res.status(502).json({ error: USER_ERROR });
    }
    res.json({ ok: true, provider: json });
  } catch (e) {
    await writeAudit({
      level: 'error',
      source: 'payments',
      event: 'query_exception',
      message: e.message || 'Payment query failed'
    });
    res.status(500).json({ error: USER_ERROR });
  }
});

paymentsRouter.post('/webhook', async (req, res, next) => {
  try {
    // Optional shared secret — set UNIWEBPAY_WEBHOOK_SECRET on Vercel + same value in Uniwebpay notify config if supported
    const expectedSecret = process.env.UNIWEBPAY_WEBHOOK_SECRET || '';
    if (expectedSecret) {
      const got =
        req.headers['x-webhook-secret'] ||
        req.headers['x-uniwebpay-secret'] ||
        req.query?.secret ||
        '';
      if (String(got) !== expectedSecret) {
        await writeAudit({
          level: 'error',
          source: 'payments',
          event: 'webhook_rejected',
          message: 'Webhook secret mismatch'
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // If Store-Id header present, must match configured store
    const storeHeader = req.headers['store-id'] || req.headers['Store-Id'];
    if (storeHeader && process.env.UNIWEBPAY_STORE_ID && String(storeHeader) !== String(process.env.UNIWEBPAY_STORE_ID)) {
      await writeAudit({
        level: 'error',
        source: 'payments',
        event: 'webhook_store_mismatch',
        message: 'Store-Id header does not match configured store'
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body || {};
    const clientTransactionId = String(
      payload.clientTransactionId || payload.client_transaction_id || payload.transactionId || ''
    );
    if (!clientTransactionId) {
      return res.status(400).json({ error: 'Missing transaction id' });
    }

    const statusRaw = String(payload.status || payload.paymentStatus || '').toLowerCase();
    const paid = statusRaw.includes('success') || statusRaw.includes('paid') || statusRaw === '1';

    await writeAudit({
      level: 'info',
      source: 'payments',
      event: 'webhook_received',
      message: paid ? 'Webhook marked payment paid' : 'Webhook received',
      detail: { clientTransactionId, statusRaw }
    });

    if (hasDatabaseUrl()) {
      const { rows } = await dbQuery(`select id, order_id from public.payments where client_transaction_id = $1`, [
        clientTransactionId
      ]);
      if (!rows.length) {
        await writeAudit({
          level: 'warn',
          source: 'payments',
          event: 'webhook_unknown_txn',
          message: 'Webhook for unknown transaction ignored',
          detail: { clientTransactionId }
        });
        return res.status(404).json({ error: 'Unknown transaction' });
      }
      await dbQuery(
        `update public.payments set status=$2, raw_webhook=$3::jsonb, updated_at=now() where client_transaction_id=$1`,
        [clientTransactionId, paid ? 'paid' : 'pending', JSON.stringify(payload)]
      );
      if (paid) {
        await dbQuery(
          `update public.orders set status='pending', updated_at=now()
           where id = $1`,
          [rows[0].order_id]
        );
      }
      return res.json({ received: true });
    }

    if (memoryEnabled() || !hasServiceRole()) {
      const existing = memGetPayment(clientTransactionId);
      if (!existing) return res.status(404).json({ error: 'Unknown transaction' });
      const payment = memUpsertPayment(clientTransactionId, {
        status: paid ? 'paid' : 'pending',
        raw_webhook: payload
      });
      if (payment?.order_id && paid) {
        const { memUpdateOrder } = await import('../lib/memoryStore.js');
        memUpdateOrder(payment.order_id, { status: 'pending' });
      }
      return res.json({ received: true });
    }

    const sb = getSupabaseAdmin();
    const { data: existing } = await sb
      .from('payments')
      .select('order_id')
      .eq('client_transaction_id', clientTransactionId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Unknown transaction' });

    await sb
      .from('payments')
      .update({
        status: paid ? 'paid' : 'pending',
        raw_webhook: payload,
        updated_at: new Date().toISOString()
      })
      .eq('client_transaction_id', clientTransactionId);

    if (existing.order_id && paid) {
      await sb.from('orders').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', existing.order_id);
    }
    res.json({ received: true });
  } catch (e) {
    await writeAudit({
      level: 'error',
      source: 'payments',
      event: 'webhook_exception',
      message: e.message || 'Webhook handling failed'
    });
    next(e);
  }
});
