import crypto from 'crypto';
import { dbQuery, hasDatabaseUrl } from './db.js';

const memAudits = [];

async function ensureAuditTable() {
  if (!hasDatabaseUrl()) return false;
  await dbQuery(`
    create table if not exists public.audit_logs (
      id text primary key,
      level text not null default 'error',
      source text not null default 'payments',
      event text not null,
      message text not null,
      detail jsonb,
      order_id text,
      created_at timestamptz not null default now()
    )
  `);
  return true;
}

/**
 * Persist an admin-visible audit event. Never throw to callers.
 */
export async function writeAudit({ level = 'error', source = 'payments', event, message, detail = null, orderId = null }) {
  const row = {
    id: crypto.randomUUID(),
    level: String(level || 'error'),
    source: String(source || 'payments'),
    event: String(event || 'unknown'),
    message: String(message || ''),
    detail: detail ?? null,
    order_id: orderId ? String(orderId) : null,
    created_at: new Date().toISOString()
  };
  try {
    if (await ensureAuditTable()) {
      await dbQuery(
        `insert into public.audit_logs (id, level, source, event, message, detail, order_id)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [row.id, row.level, row.source, row.event, row.message, JSON.stringify(row.detail), row.order_id]
      );
      return row;
    }
    memAudits.unshift(row);
    if (memAudits.length > 500) memAudits.length = 500;
  } catch (e) {
    console.warn('audit write failed:', e.message);
    memAudits.unshift({ ...row, detail: { ...(row.detail || {}), _auditError: e.message } });
  }
  return row;
}

export async function listAudits({ limit = 100, source } = {}) {
  if (await ensureAuditTable()) {
    if (source) {
      const { rows } = await dbQuery(
        `select id, level, source, event, message, detail, order_id, created_at
         from public.audit_logs
         where source = $1
         order by created_at desc
         limit $2`,
        [source, limit]
      );
      return { audits: rows, source: 'postgres' };
    }
    const { rows } = await dbQuery(
      `select id, level, source, event, message, detail, order_id, created_at
       from public.audit_logs
       order by created_at desc
       limit $1`,
      [limit]
    );
    return { audits: rows, source: 'postgres' };
  }
  let list = [...memAudits];
  if (source) list = list.filter((a) => a.source === source);
  return { audits: list.slice(0, limit), source: 'memory' };
}

export async function deleteAudit(id) {
  if (await ensureAuditTable()) {
    await dbQuery(`delete from public.audit_logs where id = $1`, [id]);
    return true;
  }
  const i = memAudits.findIndex((a) => a.id === id);
  if (i >= 0) memAudits.splice(i, 1);
  return true;
}
