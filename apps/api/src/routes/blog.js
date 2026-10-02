import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadStaticBlog() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/blog.json'), 'utf8'));
  } catch {
    return [];
  }
}

export const blogRouter = Router();

blogRouter.get('/', async (_req, res, next) => {
  try {
    if (hasDatabaseUrl()) {
      const { rows } = await dbQuery(
        `select * from public.blog_posts where active = true order by published_at desc nulls last`
      );
      if (rows.length) return res.json({ posts: rows, source: 'supabase-postgres' });
    }
    try {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from('blog_posts')
        .select('*')
        .eq('active', true)
        .order('published_at', { ascending: false });
      if (!error && data?.length) return res.json({ posts: data, source: 'supabase' });
    } catch {
      /* fall through */
    }
    res.json({ posts: loadStaticBlog(), source: 'static-fallback' });
  } catch (e) {
    next(e);
  }
});

blogRouter.get('/:handle', async (req, res, next) => {
  try {
    if (hasDatabaseUrl()) {
      const { rows } = await dbQuery(`select * from public.blog_posts where handle = $1`, [req.params.handle]);
      if (rows[0]) return res.json({ post: rows[0], source: 'supabase-postgres' });
    }
    try {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.from('blog_posts').select('*').eq('handle', req.params.handle).maybeSingle();
      if (!error && data) return res.json({ post: data, source: 'supabase' });
    } catch {
      /* fall through */
    }
    const found = loadStaticBlog().find((p) => p.handle === req.params.handle);
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json({ post: found, source: 'static-fallback' });
  } catch (e) {
    next(e);
  }
});
