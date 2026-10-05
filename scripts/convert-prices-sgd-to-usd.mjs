/**
 * One-time: convert product prices SGD → USD (divide by USD_TO_SGD_RATE).
 * Usage: node scripts/convert-prices-sgd-to-usd.mjs [rate]
 * Reads apps/api/.env.client (or DATABASE_URL from env).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'apps/api/.env.client');
const env = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
const rate = Number(process.argv[2] || env.USD_TO_SGD_RATE || process.env.USD_TO_SGD_RATE || 1.35);
if (!(rate > 0)) {
  console.error('Invalid rate');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required (apps/api/.env.client or env)');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const cur = await pool.query(`select value from public.settings where key = 'catalog_currency'`);
const raw = cur.rows[0]?.value;
const catalogCurrency =
  typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw?.value || raw || 'SGD';
if (String(catalogCurrency).toUpperCase() === 'USD' && process.argv[3] !== '--force') {
  console.error('catalog_currency is already USD. Pass --force as 3rd arg to convert again.');
  await pool.end();
  process.exit(1);
}

const { rows } = await pool.query(
  `select id, handle, price_aed, compare_at_aed from public.products where price_aed is not null`
);

let updated = 0;
for (const p of rows) {
  const priceUsd = Math.round((Number(p.price_aed) / rate) * 100) / 100;
  const compareUsd =
    p.compare_at_aed != null && Number(p.compare_at_aed) > 0
      ? Math.round((Number(p.compare_at_aed) / rate) * 100) / 100
      : null;
  await pool.query(`update public.products set price_aed = $2, compare_at_aed = $3 where id = $1`, [
    p.id,
    priceUsd,
    compareUsd
  ]);
  updated += 1;
  if (updated <= 8) {
    console.log(`${p.handle}: ${p.price_aed} SGD → $${priceUsd} USD`);
  }
}

await pool.query(
  `insert into public.settings (key, value, updated_at)
   values
     ('catalog_currency', to_jsonb('USD'::text), now()),
     ('usd_to_sgd_rate', to_jsonb($1::text), now()),
     ('default_currency', to_jsonb('USD'::text), now())
   on conflict (key) do update set value = excluded.value, updated_at = now()`,
  [String(rate)]
);

console.log(`\nDone. Updated ${updated} products at rate ${rate}.`);
console.log('Pay-time: charge_sgd_cents = round(usd_total * rate * 100). Uniwebpay currency stays SGD.');
await pool.end();
