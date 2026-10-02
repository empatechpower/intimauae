/**
 * Import migrations-data/supabase-export/*.json into Firestore.
 * Requires: firebase-service-account.json in project root
 * Run: node scripts/import-to-firebase.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const keyPath = path.join(root, 'firebase-service-account.json');
const exportDir = path.join(root, 'migrations-data', 'supabase-export');

const COLLECTION_MAP = {
  categories: 'categories',
  warehouses: 'warehouses',
  products: 'products',
  product_images: 'product_images',
  profiles: 'profiles',
  addresses: 'addresses',
  coupons: 'coupons',
  user_coupons: 'user_coupons',
  orders: 'orders',
  order_items: 'order_items',
  payments: 'payments',
  messages: 'messages',
  blog_posts: 'blog_posts',
  cms_pages: 'cms_pages',
  settings: 'settings',
  contact_messages: 'contact_messages',
  audit_logs: 'audit_logs'
};

function docId(table, row) {
  if (table === 'settings' && row.key) return String(row.key);
  if (row.id != null) return String(row.id);
  if (row.handle) return String(row.handle);
  if (row.code) return String(row.code);
  return undefined;
}

function scrub(row) {
  const out = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (v != null && typeof v === 'object' && v.toISOString) out[k] = v.toISOString();
  }
  return out;
}

async function main() {
  if (!fs.existsSync(keyPath)) {
    console.error(`
Missing Firebase service account file:
  ${keyPath}

1) Firebase Console → Project settings → Service accounts
2) Generate new private key
3) Save the JSON as firebase-service-account.json in the project root
4) Run this script again
`);
    process.exit(1);
  }
  if (!fs.existsSync(exportDir)) {
    console.error('Export folder missing. Run: node scripts/export-supabase-data.mjs');
    process.exit(1);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    console.error('Install first: npm install firebase-admin -w apps/api');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  const db = admin.firestore();

  const manifest = {};
  for (const [fileBase, collection] of Object.entries(COLLECTION_MAP)) {
    const file = path.join(exportDir, `${fileBase}.json`);
    if (!fs.existsSync(file)) {
      console.log(`skip (no file): ${fileBase}`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows) || !rows.length) {
      console.log(`skip (empty): ${fileBase}`);
      manifest[collection] = 0;
      continue;
    }

    let written = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const row of rows) {
      const id = docId(fileBase, row);
      const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();
      batch.set(ref, scrub(row), { merge: true });
      written += 1;
      batchCount += 1;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount) await batch.commit();
    manifest[collection] = written;
    console.log(`imported ${collection}: ${written}`);
  }

  fs.writeFileSync(
    path.join(exportDir, '_firebase_import_manifest.json'),
    JSON.stringify({ importedAt: new Date().toISOString(), manifest }, null, 2)
  );
  console.log('\nFirestore import complete.');
  console.log('Next: recreate admin in Firebase Authentication, then wire the API to Firestore.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
