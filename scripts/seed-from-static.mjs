import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const products = JSON.parse(fs.readFileSync(path.join(__dirname, '../apps/api/src/data/products.json'), 'utf8'));
const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '../apps/api/src/data/blog.json'), 'utf8'));

const catMap = {
  'Full Body Products': 'full-body',
  'Partial Body Products': 'partial-body',
  Trunk: 'trunk'
};

async function main() {
  for (const p of products) {
    const row = {
      id: p.id,
      handle: p.handle,
      title: p.title,
      vendor: p.vendor || 'Intimauae',
      category_id: catMap[p.category] || p.category_id || 'full-body',
      subcategory: p.subcategory || null,
      warehouse: p.warehouse || 'UAE Warehouse',
      price_aed: p.price,
      compare_at_aed: p.compare_at_price || null,
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
    if (error) console.error('product', p.handle, error.message);
    else {
      await sb.from('product_images').delete().eq('product_id', p.id);
      const imgs = (p.images || []).map((url, i) => ({ product_id: p.id, url, sort_order: i }));
      if (imgs.length) await sb.from('product_images').insert(imgs);
      console.log('ok', p.handle);
    }
  }

  for (const post of posts) {
    const { error } = await sb.from('blog_posts').upsert({
      handle: post.handle,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body || [],
      image: post.image,
      published_at: post.date,
      active: true
    }, { onConflict: 'handle' });
    if (error) console.error('blog', post.handle, error.message);
    else console.log('blog ok', post.handle);
  }
  console.log('seed complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
