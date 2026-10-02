/**
 * Export all public app tables from current Postgres (Supabase) to JSON files.
 * Run: node scripts/export-supabase-data.mjs
 * Output: migrations-data/supabase-export/
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, 'apps/api/.env') });

const TABLES = [
  'categories',
  'warehouses',
  'products',
  'product_images',
  'profiles',
  'addresses',
  'coupons',
  'user_coupons',
  'orders',
  'order_items',
  'payments',
  'messages',
  'blog_posts',
  'cms_pages',
  'settings'
];

const outDir = path.join(root, 'migrations-data', 'supabase-export');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing in apps/api/.env');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  });

  const summary = {};
  try {
    for (const table of TABLES) {
      try {
        const { rows } = await pool.query(`select * from public.${table}`);
        const file = path.join(outDir, `${table}.json`);
        fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
        summary[table] = rows.length;
        console.log(`exported ${table}: ${rows.length} rows`);
      } catch (e) {
        summary[table] = { error: e.message };
        console.warn(`skip ${table}:`, e.message);
      }
    }

    // Extra CMS / contact tables that may exist
    for (const table of ['contact_messages', 'audit_logs']) {
      try {
        const { rows } = await pool.query(`select * from public.${table}`);
        fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
        summary[table] = rows.length;
        console.log(`exported ${table}: ${rows.length} rows`);
      } catch {
        /* optional */
      }
    }

    fs.writeFileSync(
      path.join(outDir, '_manifest.json'),
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          source: 'supabase-postgres',
          tables: summary
        },
        null,
        2
      )
    );
    console.log('\nDone →', outDir);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
