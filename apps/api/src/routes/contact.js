import { Router } from 'express';
import crypto from 'crypto';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';

export const contactRouter = Router();

const memMessages = [];

async function ensureTable() {
  if (!hasDatabaseUrl()) return false;
  await dbQuery(`
    create table if not exists public.contact_messages (
      id text primary key,
      name text not null,
      email text not null,
      topic text,
      message text not null,
      status text not null default 'new',
      created_at timestamptz not null default now()
    )
  `);
  return true;
}

/** Public: submit contact form */
contactRouter.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const topic = String(req.body?.topic || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message is too long.' });
    }

    const id = crypto.randomUUID();
    if (await ensureTable()) {
      const { rows } = await dbQuery(
        `insert into public.contact_messages (id, name, email, topic, message)
         values ($1,$2,$3,$4,$5)
         returning id, name, email, topic, message, status, created_at`,
        [id, name, email, topic || null, message]
      );
      return res.json({ ok: true, message: rows[0] });
    }

    const row = {
      id,
      name,
      email,
      topic: topic || null,
      message,
      status: 'new',
      created_at: new Date().toISOString()
    };
    memMessages.unshift(row);
    res.json({ ok: true, message: row });
  } catch (e) {
    next(e);
  }
});

/** Admin helpers exported for admin router mounting */
export async function listContactMessages() {
  if (await ensureTable()) {
    const { rows } = await dbQuery(
      `select id, name, email, topic, message, status, created_at
       from public.contact_messages
       order by created_at desc
       limit 200`
    );
    return { messages: rows, source: 'postgres' };
  }
  return { messages: [...memMessages], source: 'memory' };
}

export async function updateContactMessage(id, patch) {
  if (await ensureTable()) {
    const status = patch.status != null ? String(patch.status) : null;
    const { rows } = await dbQuery(
      `update public.contact_messages
       set status = coalesce($2, status)
       where id = $1
       returning id, name, email, topic, message, status, created_at`,
      [id, status]
    );
    return rows[0] || null;
  }
  const i = memMessages.findIndex((m) => m.id === id);
  if (i < 0) return null;
  if (patch.status != null) memMessages[i].status = String(patch.status);
  return memMessages[i];
}

export async function deleteContactMessage(id) {
  if (await ensureTable()) {
    await dbQuery(`delete from public.contact_messages where id = $1`, [id]);
    return true;
  }
  const i = memMessages.findIndex((m) => m.id === id);
  if (i >= 0) memMessages.splice(i, 1);
  return true;
}
