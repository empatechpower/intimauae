import { Router } from 'express';
import { getSupabaseAdmin, hasServiceRole, requireUser } from '../lib/supabase.js';
import { aedToSgdCents, newClientTxnId } from '../lib/uniwebpay.js';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';
import {
  memCreateOrder,
  memCreatePayment,
  memGetOrder,
  memListOrders,
  memoryEnabled
} from '../lib/memoryStore.js';
import { writeAudit } from '../lib/audit.js';

export const ordersRouter = Router();

function usePg() {
  // Prefer direct Postgres whenever DATABASE_URL is set (same as admin/payments).
  // The old `&& !hasServiceRole()` check forced the Supabase client path in
  // production and broke guest/checkout order inserts.
  return hasDatabaseUrl();
}

ordersRouter.get('/mine', async (req, res, next) => {
  try {
    const user = await requireUser(req);
    const status = req.query.status;

    if (usePg()) {
      let q = `select * from public.orders where user_id = $1`;
      const params = [user.id];
      if (status && status !== 'all') {
        q += ` and status = $2`;
        params.push(status);
      }
      q += ` order by created_at desc`;
      const { rows } = await dbQuery(q, params);
      for (const o of rows) {
        const items = await dbQuery(`select * from public.order_items where order_id = $1`, [o.id]);
        o.order_items = items.rows;
      }
      return res.json({ orders: rows, source: 'postgres' });
    }

    if (memoryEnabled() || !hasServiceRole()) {
      return res.json({ orders: memListOrders(user.id, status), source: 'memory' });
    }

    const sb = getSupabaseAdmin();
    let q = sb
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ orders: data || [] });
  } catch (e) {
    next(e);
  }
});

ordersRouter.post('/', async (req, res, next) => {
  try {
    const user = await requireUser(req);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Cart empty' });

    const subtotal = items.reduce((n, it) => n + Number(it.price_aed || it.price || 0) * Number(it.qty || 1), 0);
    const charge_sgd_cents = aedToSgdCents(subtotal, 1);
    const clientTransactionId = newClientTxnId();

    if (usePg()) {
      const { rows } = await dbQuery(
        `insert into public.orders (user_id, email, status, currency_display, subtotal_aed, total_aed, charge_sgd_cents, shipping_address, notes)
         values ($1,$2,'unpaid','SGD',$3,$3,$4,$5::jsonb,$6) returning *`,
        [
          user.id,
          req.body.email || user.email || null,
          subtotal,
          charge_sgd_cents,
          req.body.shipping_address ? JSON.stringify(req.body.shipping_address) : null,
          req.body.notes || null
        ]
      );
      const order = rows[0];
      for (const it of items) {
        await dbQuery(
          `insert into public.order_items (order_id, product_id, handle, title, image, unit_price_aed, qty)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            order.id,
            it.id || it.product_id || null,
            it.handle,
            it.title,
            it.image || (it.images && it.images[0]) || null,
            Number(it.price_aed || it.price || 0),
            Number(it.qty || 1)
          ]
        );
      }
      const pay = await dbQuery(
        `insert into public.payments (order_id, client_transaction_id, status, amount_sgd_cents)
         values ($1,$2,'created',$3) returning *`,
        [order.id, clientTransactionId, charge_sgd_cents]
      );
      const itemsRes = await dbQuery(`select * from public.order_items where order_id = $1`, [order.id]);
      order.order_items = itemsRes.rows;
      return res.status(201).json({ order, payment: pay.rows[0], clientTransactionId, source: 'postgres' });
    }

    if (memoryEnabled() || !hasServiceRole()) {
      const order = memCreateOrder({
        userId: user.id,
        email: req.body.email || user.email || null,
        items,
        shipping_address: req.body.shipping_address,
        notes: req.body.notes,
        subtotal,
        charge_sgd_cents
      });
      const payment = memCreatePayment({
        order_id: order.id,
        client_transaction_id: clientTransactionId,
        status: 'created',
        amount_sgd_cents: charge_sgd_cents
      });
      return res.status(201).json({ order, payment, clientTransactionId, source: 'memory' });
    }

    const sb = getSupabaseAdmin();
    const { data: order, error } = await sb
      .from('orders')
      .insert({
        user_id: user.id,
        email: req.body.email || user.email || null,
        status: 'unpaid',
        currency_display: 'SGD',
        subtotal_aed: subtotal,
        total_aed: subtotal,
        charge_sgd_cents,
        shipping_address: req.body.shipping_address || null,
        notes: req.body.notes || null
      })
      .select('*')
      .single();
    if (error) throw error;

    const rows = items.map((it) => ({
      order_id: order.id,
      product_id: it.id || it.product_id || null,
      handle: it.handle,
      title: it.title,
      image: it.image || (it.images && it.images[0]) || null,
      unit_price_aed: Number(it.price_aed || it.price || 0),
      qty: Number(it.qty || 1)
    }));
    const { error: itemErr } = await sb.from('order_items').insert(rows);
    if (itemErr) throw itemErr;

    const { data: payment, error: payErr } = await sb
      .from('payments')
      .insert({
        order_id: order.id,
        client_transaction_id: clientTransactionId,
        status: 'created',
        amount_sgd_cents: charge_sgd_cents
      })
      .select('*')
      .single();
    if (payErr) throw payErr;

    res.status(201).json({ order, payment, clientTransactionId });
  } catch (e) {
    await writeAudit({
      level: 'error',
      source: 'orders',
      event: 'order_create_failed',
      message: e.message || 'Order create failed',
      detail: { code: e.code || null }
    });
    next(e);
  }
});

ordersRouter.get('/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(`select * from public.orders where id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      const items = await dbQuery(`select * from public.order_items where order_id = $1`, [req.params.id]);
      const pays = await dbQuery(`select * from public.payments where order_id = $1`, [req.params.id]);
      return res.json({ order: { ...rows[0], order_items: items.rows, payments: pays.rows }, source: 'postgres' });
    }
    if (memoryEnabled() || !hasServiceRole()) {
      const order = memGetOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Not found' });
      return res.json({ order, source: 'memory' });
    }
    const user = await requireUser(req);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('orders')
      .select('*, order_items(*), payments(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    if (data.user_id && data.user_id !== user.id) {
      const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ order: data });
  } catch (e) {
    next(e);
  }
});
