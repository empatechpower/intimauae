import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadStaticProducts() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf8'));
  } catch {
    return [];
  }
}

export const catalogRouter = Router();

function mapCategory(slug) {
  if (!slug || slug === 'all') return null;
  const map = {
    'full-body': 'full-body',
    'partial-body': 'partial-body',
    trunk: 'trunk'
  };
  return map[slug] || slug;
}

function normalizeProduct(p) {
  const images =
    p.images ||
    (p.product_images || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((i) => i.url);
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    title_ar: p.title_ar,
    vendor: p.vendor || 'Intimauae',
    category: p.category_id || p.category,
    category_id: p.category_id || p.category,
    subcategory: p.subcategory,
    warehouse: p.warehouse,
    price: Number(p.price_aed ?? p.price),
    price_aed: Number(p.price_aed ?? p.price),
    compare_at_price:
      p.compare_at_aed != null
        ? Number(p.compare_at_aed)
        : p.compare_at_price != null
          ? Number(p.compare_at_price)
          : null,
    description: p.description,
    height: p.height,
    material: p.material,
    skeleton: p.skeleton,
    rating: p.rating,
    reviewsCount: p.reviews_count ?? p.reviewsCount,
    tags: p.tags || [],
    images,
    isClearance: p.is_clearance ?? p.isClearance,
    isPopular: p.is_popular ?? p.isPopular
  };
}

async function loadFromPostgres(cat) {
  let sql = `
    select p.*, coalesce(
      json_agg(json_build_object('url', i.url, 'sort_order', i.sort_order) order by i.sort_order)
      filter (where i.id is not null), '[]'
    ) as product_images
    from public.products p
    left join public.product_images i on i.product_id = p.id
    where p.active = true
  `;
  const params = [];
  if (cat) {
    params.push(cat);
    sql += ` and p.category_id = $1`;
  }
  sql += ` group by p.id order by p.id`;
  const { rows } = await dbQuery(sql, params);
  return rows.map((r) => {
    const images = typeof r.product_images === 'string' ? JSON.parse(r.product_images) : r.product_images;
    return normalizeProduct({ ...r, product_images: images });
  });
}

catalogRouter.get('/products', async (req, res, next) => {
  try {
    const cat = mapCategory(req.query.category);
    if (hasDatabaseUrl()) {
      try {
        const products = await loadFromPostgres(cat);
        if (products.length) return res.json({ products, source: 'supabase-postgres' });
      } catch (e) {
        console.warn('catalog postgres', e.message);
      }
    }
    try {
      const sb = getSupabaseAdmin();
      let q = sb
        .from('products')
        .select('*, product_images(url, sort_order)')
        .eq('active', true)
        .order('id', { ascending: true });
      if (cat) q = q.eq('category_id', cat);
      const { data, error } = await q;
      if (!error && data && data.length) {
        return res.json({ products: data.map(normalizeProduct), source: 'supabase' });
      }
      if (error) console.warn('catalog supabase', error.message);
    } catch (e) {
      console.warn('catalog supabase catch', e.message);
    }
    let list = loadStaticProducts();
    if (cat) {
      const nameMap = {
        'full-body': 'Full Body Products',
        'partial-body': 'Partial Body Products',
        trunk: 'Trunk'
      };
      list = list.filter((p) => p.category_id === cat || p.category === nameMap[cat]);
    }
    res.json({ products: list.map(normalizeProduct), source: 'static-fallback' });
  } catch (e) {
    next(e);
  }
});

catalogRouter.get('/products/:handle', async (req, res, next) => {
  try {
    if (hasDatabaseUrl()) {
      try {
        const { rows } = await dbQuery(
          `select p.*, coalesce(
             json_agg(json_build_object('url', i.url, 'sort_order', i.sort_order) order by i.sort_order)
             filter (where i.id is not null), '[]'
           ) as product_images
           from public.products p
           left join public.product_images i on i.product_id = p.id
           where p.handle = $1
           group by p.id`,
          [req.params.handle]
        );
        if (rows[0]) {
          const images = typeof rows[0].product_images === 'string' ? JSON.parse(rows[0].product_images) : rows[0].product_images;
          return res.json({ product: normalizeProduct({ ...rows[0], product_images: images }), source: 'supabase-postgres' });
        }
      } catch (e) {
        console.warn('catalog product postgres', e.message);
      }
    }
    try {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from('products')
        .select('*, product_images(url, sort_order)')
        .eq('handle', req.params.handle)
        .maybeSingle();
      if (!error && data) return res.json({ product: normalizeProduct(data), source: 'supabase' });
    } catch {
      /* fall through */
    }
    const found = loadStaticProducts().find((p) => p.handle === req.params.handle);
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json({ product: normalizeProduct(found), source: 'static-fallback' });
  } catch (e) {
    next(e);
  }
});
