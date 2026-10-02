/**
 * Full Supabase bootstrap: migrate schema, storage, upload images, seed catalog/blog, create admin.
 * Usage: node scripts/bootstrap-supabase.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, 'apps/api/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xmmvprhqkhebtwxfjjig.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres.xmmvprhqkhebtwxfjjig:agATJVvuv0QB6Ezy@aws-0-eu-west-2.pooler.supabase.com:6543/postgres';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@intimauae.ae';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'IntimaAdmin2026!';
const BUCKET = 'catalog';

const apiKey = SERVICE || ANON;
const sb = createClient(SUPABASE_URL, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function log(...a) {
  console.log(...a);
}

async function withDb(fn) {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function applyMigration(client) {
  const sqlPath = path.join(ROOT, 'supabase/migrations/20260326120000_init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  log('Applying migration…');
  try {
    await client.query(sql);
    log('Migration applied');
  } catch (e) {
    // Idempotent-ish: if types/tables exist, continue
    if (/already exists/i.test(e.message)) {
      log('Migration partial (already exists) — continuing:', e.message.slice(0, 120));
    } else {
      throw e;
    }
  }
}

async function ensureStorage(client) {
  log('Ensuring storage bucket…');
  await client.query(`
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ($1, $1, true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
    on conflict (id) do update set public = true;
  `, [BUCKET]);

  await client.query(`
    drop policy if exists "Public read catalog" on storage.objects;
    drop policy if exists "Public upload catalog" on storage.objects;
    drop policy if exists "Public update catalog" on storage.objects;
    create policy "Public read catalog" on storage.objects for select using (bucket_id = '${BUCKET}');
    create policy "Public upload catalog" on storage.objects for insert with check (bucket_id = '${BUCKET}');
    create policy "Public update catalog" on storage.objects for update using (bucket_id = '${BUCKET}');
  `);
  log('Storage ready');
}

function collectImageFiles() {
  const imagesRoot = path.join(ROOT, 'assets/images');
  const files = [];
  function walk(dir, rel = '') {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, r);
      else if (/\.(jpe?g|png|webp|gif|svg)$/i.test(name)) files.push({ full, rel: r.replace(/\\/g, '/') });
    }
  }
  walk(imagesRoot);
  return files;
}

async function uploadImages() {
  const files = collectImageFiles();
  log(`Uploading ${files.length} images to storage…`);
  let ok = 0;
  let fail = 0;
  const urlMap = new Map();
  for (const f of files) {
    const objectPath = f.rel;
    const buf = fs.readFileSync(f.full);
    const contentType =
      f.rel.endsWith('.png') ? 'image/png' : f.rel.endsWith('.webp') ? 'image/webp' : f.rel.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
    const { error } = await sb.storage.from(BUCKET).upload(objectPath, buf, {
      contentType,
      upsert: true
    });
    if (error) {
      fail++;
      if (fail < 8) console.warn('upload fail', objectPath, error.message);
    } else {
      ok++;
      const { data } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
      urlMap.set(`/assets/images/${objectPath}`, data.publicUrl);
      urlMap.set(`assets/images/${objectPath}`, data.publicUrl);
    }
  }
  log(`Images uploaded: ${ok} ok, ${fail} fail`);
  return urlMap;
}

function mapUrl(src, urlMap) {
  if (!src) return src;
  if (src.startsWith('http')) return src;
  const key = src.startsWith('/') ? src : `/${src}`;
  if (urlMap.has(key)) return urlMap.get(key);
  if (urlMap.has(src)) return urlMap.get(src);
  // fallback construct
  const rel = key.replace(/^\/assets\/images\//, '');
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${rel}`;
}

async function seedCatalog(urlMap) {
  const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/src/data/products.json'), 'utf8'));
  const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/src/data/blog.json'), 'utf8'));
  const catMap = {
    'Full Body Products': 'full-body',
    'Partial Body Products': 'partial-body',
    Trunk: 'trunk'
  };

  log(`Seeding ${products.length} products…`);
  for (const p of products) {
    const images = (p.images || []).map((u) => mapUrl(u, urlMap));
    const row = {
      id: p.id,
      handle: p.handle,
      title: p.title,
      vendor: p.vendor || 'Intimauae',
      category_id: catMap[p.category] || p.category_id || 'full-body',
      subcategory: p.subcategory || null,
      warehouse: p.warehouse || 'UAE Warehouse',
      price_aed: p.price_aed ?? p.price,
      compare_at_aed: p.compare_at_aed ?? p.compare_at_price ?? null,
      description: p.description || null,
      height: p.height || null,
      material: p.material || null,
      skeleton: p.skeleton || null,
      rating: p.rating || 4.8,
      reviews_count: p.reviewsCount || 0,
      tags: p.tags || [],
      is_clearance: !!p.isClearance,
      is_popular: !!p.isPopular,
      active: true
    };
    const { error } = await sb.from('products').upsert(row);
    if (error) {
      console.warn('product', p.handle, error.message);
      continue;
    }
    await sb.from('product_images').delete().eq('product_id', p.id);
    if (images.length) {
      const { error: ie } = await sb.from('product_images').insert(images.map((url, i) => ({ product_id: p.id, url, sort_order: i })));
      if (ie) console.warn('images', p.handle, ie.message);
    }
  }

  log(`Seeding ${posts.length} blog posts…`);
  for (const post of posts) {
    const { error } = await sb.from('blog_posts').upsert(
      {
        handle: post.handle,
        title: post.title,
        excerpt: post.excerpt,
        body: post.body || [],
        image: mapUrl(post.image, urlMap),
        published_at: post.date || post.published_at || null,
        active: true
      },
      { onConflict: 'handle' }
    );
    if (error) console.warn('blog', post.handle, error.message);
  }

  // CMS pages
  await sb.from('cms_pages').upsert([
    { slug: 'about', title: 'About', body: 'Intimauae Luxury Studio — Full Body, Partial Body & Trunk.' },
    { slug: 'privacy-policy', title: 'Privacy Policy', body: 'We never sell customer data. Payments via Uniwebpay.' },
    { slug: 'refund-policy', title: 'Refund Policy', body: 'Contact support within 7 days for damaged shipments.' },
    { slug: 'shipping-policy', title: 'Shipping Policy', body: 'Ships from UAE Warehouse in unmarked packaging.' }
  ], { onConflict: 'slug' });

  log('Catalog seed done');
}

async function ensureAdmin() {
  log('Creating admin user…');
  // Prefer Auth API signup / then elevate via SQL
  let userId = null;
  const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      data: { full_name: 'Intimauae Admin' }
    })
  });
  const signupJson = await signup.json().catch(() => ({}));
  if (signup.ok && signupJson.user?.id) {
    userId = signupJson.user.id;
    log('Admin signup ok', userId);
  } else if (/already|registered|exists/i.test(JSON.stringify(signupJson))) {
    log('Admin already exists, signing in…');
    const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const loginJson = await login.json();
    if (!login.ok) throw new Error('Admin login failed: ' + JSON.stringify(loginJson));
    userId = loginJson.user?.id || loginJson.user?.id;
    if (!userId && loginJson.access_token) {
      const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON, Authorization: `Bearer ${loginJson.access_token}` }
      });
      const meJson = await me.json();
      userId = meJson.id;
    }
  } else {
    // fallback create via SQL
    log('Signup response', signup.status, signupJson);
  }

  await withDb(async (client) => {
    if (!userId) {
      const { rows } = await client.query(`select id from auth.users where email = $1 limit 1`, [ADMIN_EMAIL]);
      if (rows[0]) userId = rows[0].id;
      else {
        // create with crypt
        const { rows: created } = await client.query(
          `
          insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
          ) values (
            coalesce((select id from auth.instances limit 1), '00000000-0000-0000-0000-000000000000'),
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            $1,
            crypt($2, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Intimauae Admin"}'::jsonb,
            now(), now(), '', '', '', ''
          )
          returning id
          `,
          [ADMIN_EMAIL, ADMIN_PASSWORD]
        );
        userId = created[0].id;
        await client.query(
          `
          insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
          values (gen_random_uuid(), $1, jsonb_build_object('sub', $1::text, 'email', $2), 'email', $1::text, now(), now(), now())
          on conflict do nothing
          `,
          [userId, ADMIN_EMAIL]
        );
        log('Admin created via SQL', userId);
      }
    }

    await client.query(
      `
      insert into public.profiles (id, email, full_name, role, preferred_lang, preferred_currency)
      values ($1, $2, 'Intimauae Admin', 'admin', 'ar', 'AED')
      on conflict (id) do update set role = 'admin', email = excluded.email, full_name = excluded.full_name
      `,
      [userId, ADMIN_EMAIL]
    );
    log('Admin role set');
  });

  return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userId };
}

async function verify() {
  const { data: products, error } = await sb.from('products').select('id,handle').limit(5);
  if (error) throw error;
  const { count } = await sb.from('products').select('*', { count: 'exact', head: true });
  const { data: imgs } = await sb.from('product_images').select('url').limit(3);
  log('Verify products count≈', count, 'sample', products?.map((p) => p.handle));
  log('Sample image URLs', imgs?.map((i) => i.url));
}

async function main() {
  if (!ANON) throw new Error('Missing SUPABASE_ANON_KEY');
  await withDb(async (client) => {
    await applyMigration(client);
    await ensureStorage(client);
  });
  const urlMap = await uploadImages();
  // Prefer REST seed; if RLS blocks without service role, use SQL
  try {
    await seedCatalog(urlMap);
    await verify();
  } catch (e) {
    log('REST seed issue, seeding via SQL…', e.message);
    await withDb(async (client) => {
      const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/src/data/products.json'), 'utf8'));
      for (const p of products) {
        const images = (p.images || []).map((u) => mapUrl(u, urlMap));
        await client.query(
          `
          insert into public.products (id, handle, title, vendor, category_id, subcategory, warehouse, price_aed, compare_at_aed, description, height, material, skeleton, rating, reviews_count, tags, is_clearance, is_popular, active)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true)
          on conflict (id) do update set title=excluded.title, price_aed=excluded.price_aed, handle=excluded.handle
          `,
          [
            p.id,
            p.handle,
            p.title,
            p.vendor || 'Intimauae',
            p.category_id || 'full-body',
            p.subcategory || null,
            p.warehouse || 'UAE Warehouse',
            p.price_aed ?? p.price,
            p.compare_at_aed ?? p.compare_at_price ?? null,
            p.description || null,
            p.height || null,
            p.material || null,
            p.skeleton || null,
            p.rating || 4.8,
            p.reviewsCount || 0,
            p.tags || [],
            !!p.isClearance,
            !!p.isPopular
          ]
        );
        await client.query(`delete from public.product_images where product_id = $1`, [p.id]);
        for (let i = 0; i < images.length; i++) {
          await client.query(`insert into public.product_images (product_id, url, sort_order) values ($1,$2,$3)`, [
            p.id,
            images[i],
            i
          ]);
        }
      }
      const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/src/data/blog.json'), 'utf8'));
      for (const post of posts) {
        await client.query(
          `
          insert into public.blog_posts (handle, title, excerpt, body, image, published_at, active)
          values ($1,$2,$3,$4::jsonb,$5,$6,true)
          on conflict (handle) do update set title=excluded.title, image=excluded.image, body=excluded.body
          `,
          [post.handle, post.title, post.excerpt || null, JSON.stringify(post.body || []), mapUrl(post.image, urlMap), post.date || null]
        );
      }
    });
  }

  // If REST upsert silently failed due to RLS, always also SQL-seed to be sure
  await withDb(async (client) => {
    const { rows } = await client.query(`select count(*)::int as n from public.products`);
    if (rows[0].n < 20) {
      log('Product count low via SQL check — forcing SQL seed');
      throw new Error('FORCE_SQL_SEED');
    }
    log('SQL product count', rows[0].n);
  }).catch(async (e) => {
    if (e.message !== 'FORCE_SQL_SEED' && !/FORCE_SQL/.test(e.message)) {
      // re-run SQL seed path
    }
    const urlMap2 = urlMap;
    await withDb(async (client) => {
      const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/src/data/products.json'), 'utf8'));
      for (const p of products) {
        const images = (p.images || []).map((u) => mapUrl(u, urlMap2));
        await client.query(
          `
          insert into public.products (id, handle, title, vendor, category_id, subcategory, warehouse, price_aed, compare_at_aed, description, height, material, skeleton, rating, reviews_count, tags, is_clearance, is_popular, active)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true)
          on conflict (id) do update set title=excluded.title, price_aed=excluded.price_aed, description=excluded.description
          `,
          [
            p.id,
            p.handle,
            p.title,
            p.vendor || 'Intimauae',
            p.category_id || 'full-body',
            p.subcategory || null,
            p.warehouse || 'UAE Warehouse',
            p.price_aed ?? p.price,
            p.compare_at_aed ?? p.compare_at_price ?? null,
            p.description || null,
            p.height || null,
            p.material || null,
            p.skeleton || null,
            p.rating || 4.8,
            p.reviewsCount || 0,
            p.tags || [],
            !!p.isClearance,
            !!p.isPopular
          ]
        );
        await client.query(`delete from public.product_images where product_id = $1`, [p.id]);
        for (let i = 0; i < images.length; i++) {
          await client.query(`insert into public.product_images (product_id, url, sort_order) values ($1,$2,$3)`, [
            p.id,
            images[i],
            i
          ]);
        }
      }
      const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/src/data/blog.json'), 'utf8'));
      for (const post of posts) {
        await client.query(
          `
          insert into public.blog_posts (handle, title, excerpt, body, image, published_at, active)
          values ($1,$2,$3,$4::jsonb,$5,$6,true)
          on conflict (handle) do update set title=excluded.title, image=excluded.image, body=excluded.body
          `,
          [post.handle, post.title, post.excerpt || null, JSON.stringify(post.body || []), mapUrl(post.image, urlMap2), post.date || null]
        );
      }
      const { rows } = await client.query(`select count(*)::int as n from public.products`);
      log('Forced SQL seed complete, products=', rows[0].n);
    });
  });

  const admin = await ensureAdmin();

  // Write DATABASE_URL into env for API
  const envPath = path.join(ROOT, 'apps/api/.env');
  let env = fs.readFileSync(envPath, 'utf8');
  if (!/^DATABASE_URL=/m.test(env)) {
    env += `\nDATABASE_URL=${DB_URL}\n`;
  } else {
    env = env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${DB_URL}`);
  }
  env = env.replace(/^ADMIN_DEV_BYPASS=.*$/m, 'ADMIN_DEV_BYPASS=0');
  if (!/^ADMIN_EMAIL=/m.test(env)) env += `ADMIN_EMAIL=${ADMIN_EMAIL}\n`;
  if (!/^ADMIN_PASSWORD=/m.test(env)) env += `ADMIN_PASSWORD=${ADMIN_PASSWORD}\n`;
  fs.writeFileSync(envPath, env);

  fs.writeFileSync(
    path.join(ROOT, 'ADMIN_CREDENTIALS.txt'),
    `Preview: http://127.0.0.1:5173\nAdmin:   http://127.0.0.1:5173/admin\nEmail:   ${admin.email}\nPassword:${admin.password}\nLogin:   http://127.0.0.1:5173/login\n`
  );

  log('\n=== DONE ===');
  log('Preview:', 'http://127.0.0.1:5173');
  log('Admin:  ', 'http://127.0.0.1:5173/admin');
  log('Email:  ', admin.email);
  log('Password:', admin.password);
}

main().catch((e) => {
  console.error('BOOTSTRAP FAIL', e);
  process.exit(1);
});
