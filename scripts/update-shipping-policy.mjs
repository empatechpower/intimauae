import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { SHIPPING_HTML } from '../apps/api/src/data/cmsDefaults.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientEnv = path.join(root, 'apps/api/.env.client');
const localEnv = path.join(root, 'apps/api/.env');

function loadDbUrl(file) {
  if (!fs.existsSync(file)) return '';
  const parsed = dotenv.parse(fs.readFileSync(file));
  return String(parsed.DATABASE_URL || '').trim();
}

const fromClient = loadDbUrl(clientEnv);
const fromLocal = loadDbUrl(localEnv);
const DATABASE_URL = process.env.DATABASE_URL || fromClient || fromLocal;
const envLabel = process.env.DATABASE_URL
  ? 'process.env'
  : fromClient
    ? path.basename(clientEnv)
    : path.basename(localEnv);
if (!DATABASE_URL) {
  console.error('No DATABASE_URL');
  process.exit(1);
}
console.log('Using', envLabel);

const value = { title: 'Shipping Policy', html: SHIPPING_HTML };
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pool.query(
  `insert into public.settings (key, value, updated_at)
   values ('page_shipping_policy', $1::jsonb, now())
   on conflict (key) do update set value = excluded.value, updated_at = now()`,
  [JSON.stringify(value)]
);
const check = await pool.query(
  `select value->>'title' as title, left(value->>'html', 220) as html_start from public.settings where key='page_shipping_policy'`
);
console.log(check.rows[0]);
await pool.end();
