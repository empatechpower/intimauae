import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

let pool;
let poolConnectionString;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Direct db.* host when pooler DNS (ENOTFOUND) fails intermittently. */
export function buildDirectDatabaseUrl() {
  if (process.env.DATABASE_URL_DIRECT) return process.env.DATABASE_URL_DIRECT;
  const pooler = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL || '';
  if (!pooler?.includes('pooler') || !supabaseUrl) return null;
  const ref = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
  if (!ref) return null;
  try {
    const parsed = new URL(pooler.replace(/^postgresql:/, 'http:'));
    const password = parsed.password;
    if (!password) return null;
    const user = 'postgres';
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(decodeURIComponent(password))}@db.${ref}.supabase.co:5432/postgres`;
  } catch {
    return null;
  }
}

export function databaseUrlCandidates() {
  const urls = [process.env.DATABASE_URL, buildDirectDatabaseUrl()].filter(Boolean);
  return [...new Set(urls)];
}

export function hasDatabaseUrl() {
  return databaseUrlCandidates().length > 0;
}

function isRetryableDbError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.toString() || '');
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    msg.includes('Connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('getaddrinfo')
  );
}

export async function resetPool() {
  if (pool) {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    pool = null;
    poolConnectionString = null;
  }
}

export function getPool(connectionString) {
  const url = connectionString || databaseUrlCandidates()[0];
  if (!url) {
    throw Object.assign(new Error('DATABASE_URL not set'), { status: 500 });
  }
  if (!pool || poolConnectionString !== url) {
    if (pool) {
      pool.end().catch(() => {});
    }
    poolConnectionString = url;
    pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      keepAlive: true
    });
    pool.on('error', (err) => {
      console.error('[db] pool error', err?.message || err);
      resetPool();
    });
  }
  return pool;
}

export async function dbQuery(text, params = []) {
  const urls = databaseUrlCandidates();
  if (!urls.length) {
    throw Object.assign(new Error('DATABASE_URL not set'), { status: 500 });
  }

  let lastErr;
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const url = urls[Math.min(attempt, urls.length - 1)];
    try {
      if (attempt > 0) await resetPool();
      const res = await getPool(url).query(text, params);
      return res;
    } catch (err) {
      lastErr = err;
      if (!isRetryableDbError(err) || attempt === maxAttempts - 1) {
        if (isRetryableDbError(err)) {
          err.message = `Database unreachable (${err.code || 'network'}). Check internet or set DATABASE_URL_DIRECT to db.*.supabase.co:5432. ${err.message}`;
        }
        throw err;
      }
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr;
}
