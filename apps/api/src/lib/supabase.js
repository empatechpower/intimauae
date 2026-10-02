import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

function supabaseUrl() {
  return process.env.SUPABASE_URL || '';
}

function anonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function hasServiceRole() {
  return Boolean(supabaseUrl() && serviceKey());
}

export function getSupabaseAdmin() {
  const url = supabaseUrl();
  const key = serviceKey() || anonKey();
  if (!url || !key) {
    throw Object.assign(new Error('Missing SUPABASE_URL or keys'), { status: 500 });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function getSupabaseAnon() {
  const url = supabaseUrl();
  const key = anonKey();
  if (!url || !key) {
    throw Object.assign(new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY'), { status: 500 });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const sb = getSupabaseAnon();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  return data.user;
}

export async function requireAdmin(req) {
  const user = await requireUser(req);
  const bypass = process.env.ADMIN_DEV_BYPASS === '1';
  const isProd = process.env.NODE_ENV === 'production';
  // Never allow admin bypass in production
  if (bypass && !isProd && !hasServiceRole()) return user;
  if (user.email && String(user.email).toLowerCase() === 'admin@intimauae.ae') return user;

  try {
    const { hasDatabaseUrl, dbQuery } = await import('./db.js');
    if (hasDatabaseUrl()) {
      const { rows } = await dbQuery(`select role from public.profiles where id = $1`, [user.id]);
      if (rows[0]?.role === 'admin') return user;
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
  } catch (e) {
    if (e.status === 403) throw e;
  }

  const sb = getSupabaseAdmin();
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'admin') {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return user;
}
