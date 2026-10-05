import { Router } from 'express';
import multer from 'multer';
import { getSupabaseAdmin, hasServiceRole, requireAdmin } from '../lib/supabase.js';
import { memAllOrders, memUpdateOrder, memoryEnabled } from '../lib/memoryStore.js';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';
import { listAudits, deleteAudit } from '../lib/audit.js';
import { listContactMessages, updateContactMessage, deleteContactMessage } from './contact.js';
import {
  PRIVACY_HTML,
  SHIPPING_HTML,
  REFUND_HTML,
  DEFAULT_SITE_BANNER,
  DEFAULT_HERO_SLIDES,
  DEFAULT_ABOUT
} from '../data/cmsDefaults.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!String(file.mimetype || '').startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  }
});
const localUploadDir = path.join(__dirname, '../../uploads');

function loadStaticProducts() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf8'));
  } catch {
    return [];
  }
}

function loadStaticBlog() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/blog.json'), 'utf8'));
  } catch {
    return [];
  }
}

function usePg() {
  return hasDatabaseUrl();
}

export const adminRouter = Router();

adminRouter.use(async (req, res, next) => {
  try {
    req.admin = await requireAdmin(req);
    next();
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/overview', async (_req, res, next) => {
  try {
    if (usePg()) {
      // One round-trip for KPIs + pipeline (fast on pooler)
      const { rows: kpi } = await dbQuery(`
        select
          (select count(*)::int from public.products where active = true) as products,
          (select count(*)::int from public.orders) as orders,
          (select count(*)::int from public.profiles) as customers,
          (select count(*)::int from public.coupons where active = true) as coupons,
          (select coalesce(sum(total_aed),0)::float from public.orders) as revenue,
          (select coalesce(sum(case when status in ('pending','shipped','success') then total_aed else 0 end),0)::float from public.orders) as paid_revenue,
          (select count(*)::int from public.orders where status = 'unpaid') as unpaid,
          (select count(*)::int from public.orders where status = 'pending') as pending,
          (select count(*)::int from public.orders where status = 'shipped') as shipped,
          (select count(*)::int from public.orders where status = 'success') as success
      `);
      const [recent, top, byDay] = await Promise.all([
        dbQuery(
          `select id, email, status, total_aed, created_at
           from public.orders order by created_at desc limit 8`
        ),
        dbQuery(
          `select oi.handle, oi.title, sum(oi.qty)::int as units, sum(oi.unit_price_aed * oi.qty)::float as revenue
           from public.order_items oi
           group by oi.handle, oi.title
           order by units desc nulls last
           limit 5`
        ),
        dbQuery(
          `select to_char(created_at::date, 'YYYY-MM-DD') as day,
                  count(*)::int as orders,
                  coalesce(sum(total_aed),0)::float as revenue
           from public.orders
           where created_at >= now() - interval '14 days'
           group by 1
           order by 1`
        )
      ]);
      const k = kpi[0] || {};
      return res.json({
        products: k.products,
        orders: k.orders,
        customers: k.customers,
        coupons: k.coupons,
        revenue: k.revenue,
        paid_revenue: k.paid_revenue,
        status_counts: {
          unpaid: k.unpaid,
          pending: k.pending,
          shipped: k.shipped,
          success: k.success
        },
        recent_orders: recent.rows,
        top_products: top.rows,
        daily: byDay.rows,
        source: 'postgres'
      });
    }

    if (memoryEnabled() || !hasServiceRole()) {
      const products = loadStaticProducts();
      const orders = memAllOrders();
      return res.json({
        products: products.length,
        orders: orders.length,
        customers: 0,
        coupons: 1,
        revenue: orders.reduce((n, o) => n + Number(o.total_aed || 0), 0),
        paid_revenue: 0,
        status_counts: { unpaid: orders.length, pending: 0, shipped: 0, success: 0 },
        recent_orders: orders.slice(0, 8),
        top_products: [],
        daily: [],
        source: 'memory'
      });
    }

    const sb = getSupabaseAdmin();
    const [{ count: products }, { count: orders }, { count: customers }] = await Promise.all([
      sb.from('products').select('*', { count: 'exact', head: true }),
      sb.from('orders').select('*', { count: 'exact', head: true }),
      sb.from('profiles').select('*', { count: 'exact', head: true })
    ]);
    res.json({
      products: products || 0,
      orders: orders || 0,
      customers: customers || 0,
      coupons: 0,
      revenue: 0,
      paid_revenue: 0,
      status_counts: {},
      recent_orders: [],
      top_products: [],
      daily: [],
      source: 'supabase'
    });
  } catch (e) {
    next(e);
  }
});

function categorySlugId(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

const FALLBACK_CATEGORIES = [
  { id: 'full-body', name_en: 'Full Body Products', name_ar: 'منتجات الجسم الكامل', slug: 'full-body', sort_order: 1 },
  { id: 'partial-body', name_en: 'Partial Body Products', name_ar: 'منتجات الجسم الجزئي', slug: 'partial-body', sort_order: 2 },
  { id: 'trunk', name_en: 'Trunk', name_ar: 'الجذع', slug: 'trunk', sort_order: 3 }
];

adminRouter.get('/categories', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(`select * from public.categories order by sort_order asc, name_en asc`);
      return res.json({ categories: rows, source: 'postgres' });
    }
    res.json({ categories: FALLBACK_CATEGORIES, source: 'static' });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/categories', async (req, res, next) => {
  try {
    const name_en = String(req.body?.name_en || req.body?.name || '').trim();
    if (!name_en) return res.status(400).json({ error: 'Category name is required' });
    const id = String(req.body?.id || '').trim() || categorySlugId(name_en);
    if (!id) return res.status(400).json({ error: 'Could not generate category id' });
    const name_ar = String(req.body?.name_ar || '').trim() || null;
    const slug = String(req.body?.slug || '').trim() || id;
    if (!usePg()) return res.status(503).json({ error: 'Database required to save categories' });
    const { rows: orderRows } = await dbQuery(`select coalesce(max(sort_order), 0) + 1 as next from public.categories`);
    const sort_order = Number(orderRows[0]?.next || 1);
    const { rows } = await dbQuery(
      `insert into public.categories (id, name_en, name_ar, slug, sort_order)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update
         set name_en = excluded.name_en,
             name_ar = coalesce(excluded.name_ar, public.categories.name_ar),
             slug = excluded.slug
       returning *`,
      [id, name_en, name_ar, slug, sort_order]
    );
    res.json({ category: rows[0], source: 'postgres' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Category id or slug already exists' });
    next(e);
  }
});

adminRouter.get('/products', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(
        `select p.*,
                coalesce(
                  json_agg(json_build_object('url', i.url, 'sort_order', i.sort_order) order by i.sort_order)
                  filter (where i.id is not null),
                  '[]'
                ) as product_images
         from public.products p
         left join public.product_images i on i.product_id = p.id
         group by p.id
         order by p.updated_at desc nulls last, p.id desc`
      );
      const products = rows.map((p) => ({
        ...p,
        price: Number(p.price_aed),
        compare_at_price: p.compare_at_aed != null ? Number(p.compare_at_aed) : null,
        images: (p.product_images || []).map((x) => x.url)
      }));
      return res.json({ products, source: 'postgres' });
    }
    if (memoryEnabled() || !hasServiceRole()) {
      return res.json({ products: loadStaticProducts(), source: 'static-fallback' });
    }
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('products').select('*, product_images(url, sort_order)').order('id');
    if (error) throw error;
    res.json({ products: data || [], source: 'supabase' });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/products/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(
        `select p.*,
                coalesce(
                  json_agg(json_build_object('url', i.url, 'sort_order', i.sort_order) order by i.sort_order)
                  filter (where i.id is not null),
                  '[]'
                ) as product_images
         from public.products p
         left join public.product_images i on i.product_id = p.id
         where p.id = $1
         group by p.id`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      const p = rows[0];
      return res.json({
        product: {
          ...p,
          price: Number(p.price_aed),
          compare_at_price: p.compare_at_aed != null ? Number(p.compare_at_aed) : null,
          images: (p.product_images || []).map((x) => x.url)
        },
        source: 'postgres'
      });
    }
    if (memoryEnabled() || !hasServiceRole()) {
      const products = loadStaticProducts();
      const product = products.find((p) => String(p.id) === String(req.params.id));
      if (!product) return res.status(404).json({ error: 'Not found' });
      return res.json({ product, source: 'static' });
    }
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('products').select('*, product_images(url, sort_order)').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ product: data, source: 'supabase' });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const ext = path.extname(req.file.originalname || '') || '.jpg';
    const objectPath = `uploads/${Date.now()}-${randomUUID().slice(0, 8)}${ext.toLowerCase()}`;

    try {
      const sb = getSupabaseAdmin();
      const { error } = await sb.storage.from('catalog').upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });
      if (!error) {
        const { data } = sb.storage.from('catalog').getPublicUrl(objectPath);
        return res.json({ url: data.publicUrl, path: objectPath, source: 'supabase-storage' });
      }
      console.warn('storage upload failed, falling back to local', error.message);
    } catch (e) {
      console.warn('storage unavailable, local fallback', e.message);
    }

    fs.mkdirSync(localUploadDir, { recursive: true });
    const filename = path.basename(objectPath);
    fs.writeFileSync(path.join(localUploadDir, filename), req.file.buffer);
    const base = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || 4123}`;
    res.json({ url: `${base}/uploads/${filename}`, path: filename, source: 'local' });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/products', async (req, res, next) => {
  try {
    const p = req.body || {};
    if (!p.handle || !p.title) return res.status(400).json({ error: 'handle and title required' });
    const id = Number(p.id) || Date.now();
    const price = Number(p.price_aed ?? p.price ?? 0);
    const compare = p.compare_at_aed ?? p.compare_at_price ?? null;

    if (usePg()) {
      const { rows } = await dbQuery(
        `insert into public.products
          (id, handle, title, title_ar, vendor, category_id, subcategory, warehouse, price_aed, compare_at_aed,
           description, height, material, skeleton, tags, stock, active,
           seo_title, seo_description, seo_keywords, slug_canonical, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::text[],$16,$17,$18,$19,$20,$21,now())
         on conflict (handle) do update set
           title = excluded.title,
           title_ar = excluded.title_ar,
           vendor = excluded.vendor,
           category_id = excluded.category_id,
           subcategory = excluded.subcategory,
           warehouse = excluded.warehouse,
           price_aed = excluded.price_aed,
           compare_at_aed = excluded.compare_at_aed,
           description = excluded.description,
           height = excluded.height,
           material = excluded.material,
           skeleton = excluded.skeleton,
           tags = excluded.tags,
           stock = excluded.stock,
           active = excluded.active,
           seo_title = excluded.seo_title,
           seo_description = excluded.seo_description,
           seo_keywords = excluded.seo_keywords,
           slug_canonical = excluded.slug_canonical,
           updated_at = now()
         returning *`,
        [
          id,
          p.handle,
          p.title,
          p.title_ar || null,
          p.vendor || 'Intimauae',
          p.category_id || 'full-body',
          p.subcategory || null,
          p.warehouse || 'UAE Warehouse',
          price,
          compare,
          p.description || null,
          p.height || null,
          p.material || null,
          p.skeleton || null,
          Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
          p.stock ?? 50,
          p.active !== false,
          p.seo_title || null,
          p.seo_description || null,
          p.seo_keywords || null,
          p.slug_canonical || p.handle || null
        ]
      );
      const product = rows[0];
      if (Array.isArray(p.images)) {
        await dbQuery(`delete from public.product_images where product_id = $1`, [product.id]);
        for (let i = 0; i < p.images.length; i++) {
          await dbQuery(`insert into public.product_images (product_id, url, sort_order) values ($1,$2,$3)`, [
            product.id,
            p.images[i],
            i
          ]);
        }
      }
      return res.json({ product, source: 'postgres' });
    }

    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY required for writes' });
    const sb = getSupabaseAdmin();
    const row = {
      id,
      handle: p.handle,
      title: p.title,
      title_ar: p.title_ar || null,
      vendor: p.vendor || 'Intimauae',
      category_id: p.category_id,
      subcategory: p.subcategory || null,
      warehouse: p.warehouse || 'UAE Warehouse',
      price_aed: price,
      compare_at_aed: compare,
      description: p.description || null,
      height: p.height || null,
      material: p.material || null,
      skeleton: p.skeleton || null,
      tags: p.tags || [],
      stock: p.stock ?? 50,
      active: p.active !== false
    };
    const { data, error } = await sb.from('products').upsert(row).select('*').single();
    if (error) throw error;
    if (Array.isArray(p.images) && p.images.length) {
      await sb.from('product_images').delete().eq('product_id', data.id);
      await sb.from('product_images').insert(p.images.map((url, i) => ({ product_id: data.id, url, sort_order: i })));
    }
    res.json({ product: data, source: 'supabase' });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/products/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (usePg()) {
      const { rows } = await dbQuery(
        `update public.products set
           title = coalesce($2, title),
           handle = coalesce($3, handle),
           price_aed = coalesce($4, price_aed),
           compare_at_aed = coalesce($5, compare_at_aed),
           category_id = coalesce($6, category_id),
           warehouse = coalesce($7, warehouse),
           description = coalesce($8, description),
           stock = coalesce($9, stock),
           active = coalesce($10, active),
           seo_title = coalesce($11, seo_title),
           seo_description = coalesce($12, seo_description),
           seo_keywords = coalesce($13, seo_keywords),
           slug_canonical = coalesce($14, slug_canonical),
           height = coalesce($15, height),
           material = coalesce($16, material),
           skeleton = coalesce($17, skeleton),
           updated_at = now()
         where id = $1
         returning *`,
        [
          req.params.id,
          body.title ?? null,
          body.handle ?? null,
          body.price_aed ?? body.price ?? null,
          body.compare_at_aed ?? body.compare_at_price ?? null,
          body.category_id ?? null,
          body.warehouse ?? null,
          body.description ?? null,
          body.stock ?? null,
          typeof body.active === 'boolean' ? body.active : null,
          body.seo_title ?? null,
          body.seo_description ?? null,
          body.seo_keywords ?? null,
          body.slug_canonical ?? null,
          body.height ?? null,
          body.material ?? null,
          body.skeleton ?? null
        ]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      if (Array.isArray(body.images)) {
        await dbQuery(`delete from public.product_images where product_id = $1`, [rows[0].id]);
        for (let i = 0; i < body.images.length; i++) {
          await dbQuery(`insert into public.product_images (product_id, url, sort_order) values ($1,$2,$3)`, [
            rows[0].id,
            body.images[i],
            i
          ]);
        }
      }
      return res.json({ product: rows[0], source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('products').update(body).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json({ product: data });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/products/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      await dbQuery(`delete from public.products where id = $1`, [req.params.id]);
      return res.json({ ok: true, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('products').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/orders', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(`
        select o.*,
          coalesce(
            (select json_agg(oi.*) from public.order_items oi where oi.order_id = o.id),
            '[]'
          ) as order_items,
          coalesce(
            (select json_agg(pay.* order by pay.created_at desc) from public.payments pay where pay.order_id = o.id),
            '[]'
          ) as payments
        from public.orders o
        order by o.created_at desc
      `);
      return res.json({ orders: rows, source: 'postgres' });
    }
    if (memoryEnabled() || !hasServiceRole()) {
      return res.json({ orders: memAllOrders(), source: 'memory' });
    }
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('orders').select('*, order_items(*), payments(*)').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ orders: data || [] });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/orders/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(
        `update public.orders set status = coalesce($2, status), updated_at = now() where id = $1 returning *`,
        [req.params.id, req.body?.status || null]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      return res.json({ order: rows[0], source: 'postgres' });
    }
    if (memoryEnabled() || !hasServiceRole()) {
      const order = memUpdateOrder(req.params.id, req.body || {});
      if (!order) return res.status(404).json({ error: 'Not found' });
      return res.json({ order, source: 'memory' });
    }
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('orders')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ order: data });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/customers', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(
        `select p.*,
                (select count(*)::int from public.orders o where o.user_id = p.id) as orders_count,
                (select coalesce(sum(total_aed),0)::float from public.orders o where o.user_id = p.id) as spent
         from public.profiles p
         order by p.created_at desc`
      );
      return res.json({ customers: rows, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.json({ customers: [], source: 'memory' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ customers: data || [] });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/coupons', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(`select * from public.coupons order by code`);
      return res.json({ coupons: rows, source: 'postgres' });
    }
    if (!hasServiceRole()) {
      return res.json({ coupons: [{ code: 'INTIMA15', percent_off: 15, active: true }], source: 'static' });
    }
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('coupons').select('*').order('code');
    if (error) throw error;
    res.json({ coupons: data || [] });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/coupons', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (usePg()) {
      const { rows } = await dbQuery(
        `insert into public.coupons (code, percent_off, amount_off_aed, active)
         values ($1,$2,$3,$4)
         on conflict (code) do update set percent_off = excluded.percent_off, amount_off_aed = excluded.amount_off_aed, active = excluded.active
         returning *`,
        [String(body.code || '').toUpperCase(), body.percent_off ?? null, body.amount_off_aed ?? null, body.active !== false]
      );
      return res.status(201).json({ coupon: rows[0], source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('coupons').insert(body).select('*').single();
    if (error) throw error;
    res.status(201).json({ coupon: data });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/coupons/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (usePg()) {
      const { rows } = await dbQuery(
        `update public.coupons set
           percent_off = coalesce($2, percent_off),
           amount_off_aed = coalesce($3, amount_off_aed),
           active = coalesce($4, active)
         where id = $1
         returning *`,
        [req.params.id, body.percent_off ?? null, body.amount_off_aed ?? null, typeof body.active === 'boolean' ? body.active : null]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      return res.json({ coupon: rows[0], source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('coupons').update(body).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json({ coupon: data });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/warehouses', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(`select * from public.warehouses order by name`);
      if (!rows.length) {
        return res.json({
          warehouses: [{ name: 'UAE Warehouse', code: 'UAE', country: 'AE', active: true }],
          source: 'postgres-default'
        });
      }
      return res.json({ warehouses: rows, source: 'postgres' });
    }
    if (!hasServiceRole()) {
      return res.json({ warehouses: [{ name: 'UAE Warehouse', code: 'UAE', country: 'AE', active: true }], source: 'static' });
    }
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('warehouses').select('*').order('name');
    if (error) throw error;
    res.json({ warehouses: data || [] });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/warehouses', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (usePg()) {
      const { rows } = await dbQuery(
        `insert into public.warehouses (name, code, country, active)
         values ($1,$2,$3,$4)
         on conflict (code) do update set name = excluded.name, country = excluded.country, active = excluded.active
         returning *`,
        [body.name, body.code || null, body.country || 'AE', body.active !== false]
      );
      return res.status(201).json({ warehouse: rows[0], source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('warehouses').insert(body).select('*').single();
    if (error) throw error;
    res.status(201).json({ warehouse: data });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/cms', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(`select * from public.cms_pages order by slug`);
      return res.json({ pages: rows, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.json({ pages: [], source: 'static' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('cms_pages').select('*').order('slug');
    if (error) throw error;
    res.json({ pages: data || [] });
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/cms/:slug', async (req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(
        `insert into public.cms_pages (slug, title, body, updated_at)
         values ($1,$2,$3,now())
         on conflict (slug) do update set title = excluded.title, body = excluded.body, updated_at = now()
         returning *`,
        [req.params.slug, req.body.title, req.body.body]
      );
      return res.json({ page: rows[0], source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('cms_pages')
      .upsert({ slug: req.params.slug, title: req.body.title, body: req.body.body, updated_at: new Date().toISOString() })
      .select('*')
      .single();
    if (error) throw error;
    res.json({ page: data });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/blog', async (_req, res, next) => {
  try {
    if (usePg()) {
      const { rows } = await dbQuery(`select * from public.blog_posts order by published_at desc nulls last`);
      return res.json({ posts: rows, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.json({ posts: loadStaticBlog(), source: 'static' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('blog_posts').select('*').order('published_at', { ascending: false });
    if (error) throw error;
    res.json({ posts: data || [] });
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/blog/:handle', async (req, res, next) => {
  try {
    const b = req.body || {};
    const bodyValue =
      typeof b.body === 'string'
        ? b.body
        : Array.isArray(b.body)
          ? b.body.join('\n\n')
          : '';
    if (usePg()) {
      const { rows } = await dbQuery(
        `insert into public.blog_posts (handle, title, excerpt, body, image, active, published_at, seo_title, seo_description, seo_keywords)
         values ($1,$2,$3,$4::jsonb,$5,$6,coalesce($7::timestamptz, now()),$8,$9,$10)
         on conflict (handle) do update set
           title = excluded.title,
           excerpt = excluded.excerpt,
           body = excluded.body,
           image = excluded.image,
           active = excluded.active,
           seo_title = excluded.seo_title,
           seo_description = excluded.seo_description,
           seo_keywords = excluded.seo_keywords
         returning *`,
        [
          req.params.handle,
          b.title,
          b.excerpt || null,
          JSON.stringify(bodyValue),
          b.image || null,
          b.active !== false,
          b.published_at || null,
          b.seo_title || null,
          b.seo_description || null,
          b.seo_keywords || null
        ]
      );
      return res.json({ post: rows[0], source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('blog_posts')
      .upsert({ handle: req.params.handle, ...b, active: b.active !== false }, { onConflict: 'handle' })
      .select('*')
      .single();
    if (error) throw error;
    res.json({ post: data });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/blog/:handle', async (req, res, next) => {
  try {
    if (usePg()) {
      await dbQuery(`delete from public.blog_posts where handle = $1`, [req.params.handle]);
      return res.json({ ok: true, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('blog_posts').delete().eq('handle', req.params.handle);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/coupons/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      await dbQuery(`delete from public.coupons where id = $1`, [req.params.id]);
      return res.json({ ok: true, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('coupons').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/warehouses/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      await dbQuery(`delete from public.warehouses where id = $1`, [req.params.id]);
      return res.json({ ok: true, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('warehouses').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/orders/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      await dbQuery(`delete from public.payments where order_id = $1`, [req.params.id]);
      await dbQuery(`delete from public.order_items where order_id = $1`, [req.params.id]);
      await dbQuery(`delete from public.orders where id = $1`, [req.params.id]);
      return res.json({ ok: true, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    await sb.from('payments').delete().eq('order_id', req.params.id);
    await sb.from('order_items').delete().eq('order_id', req.params.id);
    const { error } = await sb.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/customers/:id', async (req, res, next) => {
  try {
    if (usePg()) {
      await dbQuery(`delete from public.profiles where id = $1 and coalesce(role,'customer') <> 'admin'`, [req.params.id]);
      return res.json({ ok: true, source: 'postgres' });
    }
    if (!hasServiceRole()) return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    const sb = getSupabaseAdmin();
    const { data: profile } = await sb.from('profiles').select('role').eq('id', req.params.id).maybeSingle();
    if (profile?.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin profiles' });
    const { error } = await sb.from('profiles').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/settings', async (_req, res, next) => {
  try {
    const defaults = [
      { key: 'usd_to_sgd_rate', value: Number(process.env.USD_TO_SGD_RATE || process.env.AED_TO_SGD_RATE || 1.35) },
      { key: 'default_lang', value: 'ar' },
      { key: 'default_currency', value: 'USD' },
      { key: 'catalog_currency', value: 'SGD' },
      {
        key: 'site_seo',
        value: {
          title: 'Intimauae | Premium Body Products UAE',
          description: 'Shop Full Body, Partial Body, and Trunk products from Intimauae.',
          keywords: 'intimauae, silicone doll, UAE',
          og_image: ''
        }
      },
      { key: 'google_analytics_id', value: '' },
      { key: 'google_tag_manager_id', value: '' },
      { key: 'google_ads_id', value: '' },
      { key: 'whatsapp', value: { enabled: false, number: '', message: 'Hi Intimauae, I have a question.' } },
      {
        key: 'site_popup',
        value: {
          enabled: false,
          version: '1',
          delay_ms: 1200,
          title: 'Sign up for 10% off!',
          subtitle: 'Take 10% off your purchase. Use your coupon at checkout.',
          cta_text: 'Shop now',
          cta_url: '/catalogs',
          dismiss_label: 'No thanks',
          coupon_code: 'INTIMA15',
          image: ''
        }
      },
      { key: 'site_banner', value: { ...DEFAULT_SITE_BANNER } },
      { key: 'hero_slides', value: DEFAULT_HERO_SLIDES.map((s) => ({ ...s })) },
      { key: 'page_about', value: { ...DEFAULT_ABOUT } },
      {
        key: 'page_contact',
        value: {
          hero_title: 'Contact Us',
          hero_subtitle: 'Questions about materials, sizing, or discreet shipping? Send a message — we reply privately.',
          email: 'support@intimauae.ae',
          hours_title: 'Business hours',
          hours: 'Sunday–Thursday\n10:00–18:00 GST',
          payments_note: 'Secure checkout powered by Uniwebpay.'
        }
      },
      {
        key: 'page_faqs',
        value: {
          items: [
            { q: 'How discreet is shipping?', a: 'Unmarked packaging with neutral labeling.' },
            { q: 'What payment methods do you accept?', a: 'Secure checkout through Uniwebpay. Prices are in USD; your card is charged the SGD equivalent.' },
            { q: 'Where do you ship from?', a: 'UAE Warehouse with private delivery options.' }
          ]
        }
      },
      { key: 'page_privacy_policy', value: { title: 'Privacy Policy', html: PRIVACY_HTML } },
      { key: 'page_shipping_policy', value: { title: 'Shipping Policy', html: SHIPPING_HTML } },
      { key: 'page_refund_policy', value: { title: 'Refund Policy', html: REFUND_HTML } }
    ];
    if (usePg()) {
      const { rows } = await dbQuery(`select * from public.settings`);
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      const settings = defaults.map((d) => {
        const stored = map[d.key];
        if (d.key.startsWith('page_') && d.key.endsWith('_policy')) {
          const html = String(stored?.html || '');
          if (!stored || !html || html.length < 180) {
            return {
              key: d.key,
              value: {
                title: stored?.title || d.value.title,
                html: d.value.html
              }
            };
          }
        }
        if (d.key === 'page_about' && (!stored || !stored.html || String(stored.html).length < 80)) {
          return {
            key: d.key,
            value: {
              title: stored?.title || d.value.title,
              subtitle: stored?.subtitle || d.value.subtitle,
              html: d.value.html
            }
          };
        }
        return { key: d.key, value: stored ?? d.value };
      });
      for (const r of rows) {
        if (!settings.find((s) => s.key === r.key)) settings.push(r);
      }
      return res.json({ settings, source: 'postgres' });
    }
    res.json({ settings: defaults, source: 'env' });
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/settings/:key', async (req, res, next) => {
  try {
    const value = req.body?.value;
    if (req.params.key === 'usd_to_sgd_rate' || req.params.key === 'aed_to_sgd_rate') {
      process.env.USD_TO_SGD_RATE = String(value);
      process.env.AED_TO_SGD_RATE = String(value);
    }
    if (usePg()) {
      const { rows } = await dbQuery(
        `insert into public.settings (key, value, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()
         returning *`,
        [req.params.key, JSON.stringify(value)]
      );
      return res.json({ setting: rows[0], source: 'postgres' });
    }
    res.json({ setting: { key: req.params.key, value }, source: 'env' });
  } catch (e) {
    next(e);
  }
});

/** Payment secrets — never returns key values, only configured flags + fingerprint. */
adminRouter.get('/payments/config', async (_req, res, next) => {
  try {
    const { loadPaymentConfigFromDb, paymentConfiguredFlags } = await import('../lib/paymentConfig.js');
    await loadPaymentConfigFromDb();
    res.json({
      configured: paymentConfiguredFlags(),
      source: usePg() ? 'postgres' : 'env',
      note: 'RSA public key is registered at Uniwebpay — not stored in our database. Fingerprint is derived from the private key we load.'
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Signature self-test against Uniwebpay's published sample.
 * Signs their exact content with the stored private key and compares output.
 */
adminRouter.get('/payments/signature-test', async (_req, res, next) => {
  try {
    const { loadPaymentConfigFromDb } = await import('../lib/paymentConfig.js');
    const { signUniwebpayRequest, sortedJson, buildSignContent } = await import('../lib/uniwebpay.js');
    await loadPaymentConfigFromDb();

    const privateKey = process.env.UNIWEBPAY_PRIVATE_KEY_PKCS8;
    if (!privateKey) return res.status(503).json({ error: 'Private key not configured' });

    const expected =
      'IiU9GpWQxb6F7GXG3ZPLeLps1nvHLl8VfSPPUr5hdKTgWVmjKfeFBlE5GOKT7mw96ksYJ5oa9FXF2m8lcrfXtzX%2FrBLIZp9z6TJDennKI0d46Zepw1%2BcGtn8DCCWUZz8UbOTIIZ7rtf6PMPnidbOhbKhdu8WRvPP3t2j2WbUun7AAfgKYz7BPTbQqEAkSBSllO5bF%2BXiwkAAxI4myoQNQSSjLasFSu1hpFbIjSmRAURHPLxKG1ng4YLOv5Ncg0564Gxo%2BlKUArXVcHEeXROUz%2B6BK8bK23yRlDBIoxe0uVsR1PznJU8P5vOLwkBATMP93jr1XPqwq9ynPJYOItxfcw%3D%3D';

    const path = '/api/v1/payment/query';
    const storeId = '1551614759571685376';
    const requestTime = '2026-09-26T10:00:00+00:00';
    const bodyString = sortedJson({
      clientTransactionId: 'connectivity-check',
      transactionId: '1000000000000000001'
    });
    const contentToSign = buildSignContent({ path, storeId, requestTime, bodyString });
    const signature = signUniwebpayRequest({ path, storeId, requestTime, bodyString, privateKeyPkcs8: privateKey });

    res.json({
      match: signature === expected,
      bodyString,
      contentToSign,
      ours: signature,
      expected
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Save payment API fields. Empty strings are ignored (keep existing secret).
 * Body: { storeId, privateKey, framesPk, baseUrl, notifyUrl, keyVersion, rate }
 */
adminRouter.put('/payments/config', async (req, res, next) => {
  try {
    const { applyPaymentSetting, paymentConfiguredFlags, loadPaymentConfigFromDb } = await import(
      '../lib/paymentConfig.js'
    );
    const b = req.body || {};
    const updates = [
      ['payment_uniwebpay_store_id', b.storeId],
      ['payment_uniwebpay_private_key', b.privateKey],
      ['payment_checkout_frames_pk', b.framesPk],
      ['payment_uniwebpay_base_url', b.baseUrl],
      ['payment_uniwebpay_notify_url', b.notifyUrl],
      ['payment_uniwebpay_key_version', b.keyVersion],
      ['usd_to_sgd_rate', b.rate]
    ];

    let saved = 0;
    for (const [key, raw] of updates) {
      if (raw == null) continue;
      const str = String(raw).trim();
      if (!str) continue; // blank = leave existing secret untouched
      applyPaymentSetting(key, str);
      // Re-read normalized value (private key compacted to single-line base64)
      const envKey = {
        payment_uniwebpay_store_id: 'UNIWEBPAY_STORE_ID',
        payment_uniwebpay_private_key: 'UNIWEBPAY_PRIVATE_KEY_PKCS8',
        payment_checkout_frames_pk: 'CHECKOUT_FRAMES_PK',
        payment_uniwebpay_base_url: 'UNIWEBPAY_BASE_URL',
        payment_uniwebpay_notify_url: 'UNIWEBPAY_NOTIFY_URL',
        payment_uniwebpay_key_version: 'UNIWEBPAY_KEY_VERSION',
        usd_to_sgd_rate: 'USD_TO_SGD_RATE'
      }[key];
      const toStore = (envKey && process.env[envKey]) || str;
      if (usePg()) {
        // Store as jsonb string via to_jsonb(text) — avoids double-encoding bugs
        await dbQuery(
          `insert into public.settings (key, value, updated_at)
           values ($1, to_jsonb($2::text), now())
           on conflict (key) do update set value = excluded.value, updated_at = now()`,
          [key, toStore]
        );
      }
      saved += 1;
    }

    await loadPaymentConfigFromDb();
    const configured = paymentConfiguredFlags();
    res.json({
      ok: true,
      saved,
      message: saved
        ? `Updated ${saved} payment field(s).${configured.privateKeyOk ? ` Key fingerprint: ${configured.privateKeyFingerprint}` : configured.privateKeyError ? ` Key invalid: ${configured.privateKeyError}` : ''}`
        : 'Nothing saved — leave blank to keep existing keys.',
      configured
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/contact-messages', async (_req, res, next) => {
  try {
    const data = await listContactMessages();
    res.json(data);
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/contact-messages/:id', async (req, res, next) => {
  try {
    const row = await updateContactMessage(req.params.id, { status: req.body?.status });
    if (!row) return res.status(404).json({ error: 'Message not found' });
    res.json({ message: row });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/contact-messages/:id', async (req, res, next) => {
  try {
    await deleteContactMessage(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/products/convert-sgd-to-usd', async (req, res, next) => {
  try {
    const { getUsdToSgdRate } = await import('../lib/uniwebpay.js');
    const rate = getUsdToSgdRate(req.body?.rate);
    if (!(rate > 0)) return res.status(400).json({ error: 'Invalid USD_TO_SGD_RATE' });

    let catalogCurrency = 'SGD';
    if (usePg()) {
      const { rows: cur } = await dbQuery(`select value from public.settings where key = 'catalog_currency'`);
      const raw = cur[0]?.value;
      catalogCurrency = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw?.value || raw || 'SGD';
    }
    if (String(catalogCurrency).toUpperCase() === 'USD' && !req.body?.force) {
      return res.status(409).json({
        error: 'Catalog already marked USD. Pass { "force": true } only if you intentionally need to convert again.'
      });
    }

    let updated = 0;
    const samples = [];

    if (usePg()) {
      const { rows } = await dbQuery(
        `select id, handle, price_aed, compare_at_aed from public.products where price_aed is not null`
      );
      for (const p of rows) {
        const priceUsd = Math.round((Number(p.price_aed) / rate) * 100) / 100;
        const compareUsd =
          p.compare_at_aed != null && Number(p.compare_at_aed) > 0
            ? Math.round((Number(p.compare_at_aed) / rate) * 100) / 100
            : null;
        await dbQuery(`update public.products set price_aed = $2, compare_at_aed = $3 where id = $1`, [
          p.id,
          priceUsd,
          compareUsd
        ]);
        updated += 1;
        if (samples.length < 5) {
          samples.push({
            handle: p.handle,
            was_sgd: Number(p.price_aed),
            now_usd: priceUsd
          });
        }
      }
      await dbQuery(
        `insert into public.settings (key, value, updated_at)
         values ('catalog_currency', to_jsonb('USD'::text), now()),
                ('usd_to_sgd_rate', to_jsonb($1::text), now()),
                ('default_currency', to_jsonb('USD'::text), now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [String(rate)]
      );
      process.env.USD_TO_SGD_RATE = String(rate);
      process.env.AED_TO_SGD_RATE = String(rate);
    } else if (hasServiceRole()) {
      const sb = getSupabaseAdmin();
      const { data: products, error } = await sb.from('products').select('id, handle, price_aed, compare_at_aed');
      if (error) throw error;
      for (const p of products || []) {
        const priceUsd = Math.round((Number(p.price_aed) / rate) * 100) / 100;
        const compareUsd =
          p.compare_at_aed != null && Number(p.compare_at_aed) > 0
            ? Math.round((Number(p.compare_at_aed) / rate) * 100) / 100
            : null;
        const { error: upErr } = await sb
          .from('products')
          .update({ price_aed: priceUsd, compare_at_aed: compareUsd })
          .eq('id', p.id);
        if (upErr) throw upErr;
        updated += 1;
        if (samples.length < 5) samples.push({ handle: p.handle, was_sgd: Number(p.price_aed), now_usd: priceUsd });
      }
      await sb.from('settings').upsert([
        { key: 'catalog_currency', value: 'USD' },
        { key: 'usd_to_sgd_rate', value: String(rate) },
        { key: 'default_currency', value: 'USD' }
      ]);
      process.env.USD_TO_SGD_RATE = String(rate);
      process.env.AED_TO_SGD_RATE = String(rate);
    } else {
      return res.status(503).json({ error: 'DATABASE_URL or service role required' });
    }

    res.json({
      ok: true,
      rate,
      updated,
      samples,
      message: `Converted ${updated} product(s) SGD→USD at rate ${rate}. Pay-time charge uses the same rate.`
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/audits', async (req, res, next) => {
  try {
    const data = await listAudits({
      limit: Math.min(200, Number(req.query.limit) || 100),
      source: req.query.source || undefined
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/audits/:id', async (req, res, next) => {
  try {
    await deleteAudit(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
