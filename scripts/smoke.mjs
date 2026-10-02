const API = process.env.API_URL || 'http://127.0.0.1:4123';

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status} ${data.error || res.statusText}`);
  return data;
}

async function main() {
  const health = await req('/api/health');
  console.log('health', health);

  const catalog = await req('/api/catalog/products');
  console.log('products', catalog.products?.length, 'source', catalog.source);
  if (!catalog.products?.length) throw new Error('No products');

  const blog = await req('/api/blog');
  console.log('blog', blog.posts?.length, 'source', blog.source);

  const sample = catalog.products[0];
  const order = await req('/api/orders', {
    method: 'POST',
    body: {
      items: [
        {
          id: sample.id,
          handle: sample.handle,
          title: sample.title,
          price_aed: sample.price_aed || sample.price,
          image: sample.images?.[0],
          qty: 1
        }
      ],
      email: 'smoke@intimauae.ae'
    }
  });
  console.log('order', order.order?.id, 'sgd_cents', order.order?.charge_sgd_cents, 'source', order.source);

  const pay = await req('/api/payments/create', {
    method: 'POST',
    body: { orderId: order.order.id }
  });
  console.log('payment', pay.mode || 'live', pay.clientTransactionId, 'amount', pay.amountSgdCents);

  const cfg = await req('/api/payments/config');
  console.log('pay config ready=', cfg.ready, 'store', cfg.storeId);

  console.log('SMOKE OK');
}

main().catch((e) => {
  console.error('SMOKE FAIL', e.message);
  process.exit(1);
});
