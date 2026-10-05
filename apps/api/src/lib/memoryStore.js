import crypto from 'crypto';

const orders = new Map();
const payments = new Map();

export function memoryEnabled() {
  // Prefer Postgres when DATABASE_URL is configured
  if (process.env.DATABASE_URL) return false;
  return !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function memCreateOrder({ userId, email, items, shipping_address, notes, subtotal, charge_sgd_cents }) {
  const id = crypto.randomUUID();
  const order = {
    id,
    user_id: userId || null,
    email: email || null,
    status: 'unpaid',
    currency_display: 'USD',
    subtotal_aed: subtotal,
    total_aed: subtotal,
    charge_sgd_cents,
    shipping_address: shipping_address || null,
    notes: notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    order_items: items.map((it) => ({
      id: crypto.randomUUID(),
      order_id: id,
      product_id: it.id || it.product_id || null,
      handle: it.handle,
      title: it.title,
      image: it.image || (it.images && it.images[0]) || null,
      unit_price_aed: Number(it.price_aed || it.price || 0),
      qty: Number(it.qty || 1)
    }))
  };
  orders.set(id, order);
  return order;
}

export function memGetOrder(id) {
  return orders.get(id) || null;
}

export function memListOrders(userId, status) {
  let list = [...orders.values()].filter((o) => !userId || o.user_id === userId);
  if (status && status !== 'all') list = list.filter((o) => o.status === status);
  return list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function memUpdateOrder(id, patch) {
  const o = orders.get(id);
  if (!o) return null;
  Object.assign(o, patch, { updated_at: new Date().toISOString() });
  orders.set(id, o);
  return o;
}

export function memCreatePayment(row) {
  const id = crypto.randomUUID();
  const payment = { id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
  payments.set(String(row.client_transaction_id), payment);
  return payment;
}

export function memUpsertPayment(clientTransactionId, patch) {
  const key = String(clientTransactionId);
  const prev = payments.get(key) || { client_transaction_id: key };
  const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
  payments.set(key, next);
  return next;
}

export function memGetPayment(clientTransactionId) {
  return payments.get(String(clientTransactionId)) || null;
}

export function memAllOrders() {
  return [...orders.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
