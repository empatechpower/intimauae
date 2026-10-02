/**
 * One-shot: write full Privacy / Shipping / Refund / About CMS copy into public.settings.
 * Run: node scripts/seed-policies.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import {
  PRIVACY_HTML,
  SHIPPING_HTML,
  REFUND_HTML,
  DEFAULT_ABOUT
} from '../src/data/cmsDefaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const rows = [
  { key: 'page_privacy_policy', value: { title: 'Privacy Policy', html: PRIVACY_HTML } },
  { key: 'page_shipping_policy', value: { title: 'Shipping Policy', html: SHIPPING_HTML } },
  { key: 'page_refund_policy', value: { title: 'Refund Policy', html: REFUND_HTML } },
  { key: 'page_about', value: { ...DEFAULT_ABOUT } }
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    for (const row of rows) {
      await pool.query(
        `insert into public.settings (key, value, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [row.key, JSON.stringify(row.value)]
      );
      console.log('upserted', row.key, 'html length', String(row.value.html || '').length);
    }
    console.log('done');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
