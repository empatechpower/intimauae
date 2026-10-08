import { Router } from 'express';
import { verifyFirebaseIdToken } from '../lib/firebaseAdmin.js';
import { normalizePhone, isValidE164 } from '../lib/phone.js';
import { getSupabaseAdmin, hasServiceRole } from '../lib/supabase.js';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';
import { writeAudit } from '../lib/audit.js';

export const authRouter = Router();

const USER_MSG = {
  badRequest: 'Please try again.',
  noAccount: 'No account found for this phone. Please register first.',
  loginFailed: 'Login failed. Please try again.',
  phoneTaken: 'Phone already registered',
  invalidPhone: 'Invalid phone',
  registerFailed: 'We could not finish registration. Please try again.'
};

async function auditAuth(event, message, detail) {
  await writeAudit({
    level: 'error',
    source: 'auth',
    event,
    message,
    detail
  });
}

/**
 * After Firebase phone OTP succeeds, exchange for a Supabase session (30-day refresh).
 * Body: { idToken: string }
 */
authRouter.post('/phone-login', async (req, res, next) => {
  try {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken) return res.status(400).json({ error: USER_MSG.badRequest });
    if (!hasServiceRole()) {
      await auditAuth('phone_login_config', 'Missing Supabase service role', null);
      return res.status(500).json({ error: USER_MSG.loginFailed });
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    const phone = normalizePhone(decoded.phone_number || '');
    if (!isValidE164(phone)) {
      await auditAuth('phone_login_token', 'Firebase token missing valid phone', {
        uid: decoded?.uid || null
      });
      return res.status(400).json({ error: USER_MSG.badRequest });
    }

    const sb = getSupabaseAdmin();
    let profile = null;

    if (hasDatabaseUrl()) {
      const { rows } = await dbQuery(
        `select id, email, phone, full_name, role
           from public.profiles
          where phone = $1
             or regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g')
                = regexp_replace($1, '[^0-9]', '', 'g')
          limit 1`,
        [phone]
      );
      profile = rows[0] || null;
    }

    if (!profile) {
      const { data, error } = await sb.from('profiles').select('id, email, phone, full_name, role').eq('phone', phone).maybeSingle();
      if (error) throw error;
      profile = data;
    }

    if (!profile?.email) {
      return res.status(404).json({ error: USER_MSG.noAccount });
    }

    // Keep phone normalized on the profile
    if (profile.phone !== phone) {
      await sb.from('profiles').update({ phone }).eq('id', profile.id);
    }

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email
    });
    if (linkErr) throw linkErr;

    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) {
      await auditAuth('phone_login_session', 'generateLink missing hashed_token', { phone });
      return res.status(500).json({ error: USER_MSG.loginFailed });
    }

    // Session length: set refresh token reuse / JWT in Supabase dashboard to ~30 days.
    // Client will verifyOtp and persist the session locally.
    res.json({
      ok: true,
      phone,
      email: profile.email,
      token_hash: hashedToken,
      session_days: 30
    });
  } catch (err) {
    if (err.code === 'auth/id-token-expired' || err.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'That code is incorrect or expired. Please try again.' });
    }
    await auditAuth('phone_login_error', err.message || 'phone-login failed', {
      code: err.code || null,
      stack: err.stack || null
    });
    return res.status(500).json({ error: USER_MSG.loginFailed });
  }
});

/**
 * After signup, persist phone on profile (works even if email confirm delays session).
 * Body: { email, phone, full_name? }
 * Prefer DATABASE_URL updates — avoids RLS / wrong Supabase key "permission denied for table profiles".
 */
authRouter.post('/save-phone', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const phone = normalizePhone(req.body?.phone || '');
    const fullName = String(req.body?.full_name || '').trim();
    if (!email) return res.status(400).json({ error: USER_MSG.badRequest });
    if (!isValidE164(phone)) return res.status(400).json({ error: USER_MSG.invalidPhone });

    if (!hasDatabaseUrl() && !hasServiceRole()) {
      await auditAuth('save_phone_config', 'Missing DATABASE_URL and Supabase service role', null);
      return res.status(500).json({ error: USER_MSG.registerFailed });
    }

    // Reject if phone already used by another account
    if (hasDatabaseUrl()) {
      const { rows: taken } = await dbQuery(
        `select id, email from public.profiles
          where (phone = $1
             or regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g')
                = regexp_replace($1, '[^0-9]', '', 'g'))
            and lower(coalesce(email,'')) <> $2
          limit 1`,
        [phone, email]
      );
      if (taken[0]) return res.status(409).json({ error: USER_MSG.phoneTaken });
    } else {
      const sb = getSupabaseAdmin();
      const { data: taken } = await sb.from('profiles').select('id, email').eq('phone', phone).maybeSingle();
      if (taken && String(taken.email || '').toLowerCase() !== email) {
        return res.status(409).json({ error: USER_MSG.phoneTaken });
      }
    }

    let profileRow = null;
    if (hasDatabaseUrl()) {
      // Trigger may create profile a moment after auth.users insert — retry briefly
      for (let i = 0; i < 6 && !profileRow; i++) {
        const { rows } = await dbQuery(
          `select id, email, phone, created_at
             from public.profiles
            where lower(coalesce(email,'')) = $1
            limit 1`,
          [email]
        );
        profileRow = rows[0] || null;
        if (!profileRow) await new Promise((r) => setTimeout(r, 250));
      }
    } else {
      const sb = getSupabaseAdmin();
      const { data } = await sb.from('profiles').select('id, email, phone, created_at').ilike('email', email).maybeSingle();
      profileRow = data;
    }
    if (!profileRow?.id) {
      await auditAuth('save_phone_missing_user', 'Profile not found after signup', { email });
      return res.status(404).json({ error: USER_MSG.registerFailed });
    }

    const createdMs = profileRow.created_at ? Date.parse(profileRow.created_at) : 0;
    if (createdMs && Date.now() - createdMs > 15 * 60 * 1000) {
      return res.status(403).json({ error: USER_MSG.registerFailed });
    }

    if (hasDatabaseUrl()) {
      await dbQuery(
        `update public.profiles
            set phone = $1,
                full_name = case when $2 <> '' then $2 else full_name end,
                updated_at = now()
          where id = $3`,
        [phone, fullName, profileRow.id]
      );
    } else {
      const sb = getSupabaseAdmin();
      const patch = { phone };
      if (fullName) patch.full_name = fullName;
      const { error: upErr } = await sb.from('profiles').update(patch).eq('id', profileRow.id);
      if (upErr) throw upErr;
    }

    if (hasServiceRole()) {
      try {
        const sb = getSupabaseAdmin();
        await sb.auth.admin.updateUserById(profileRow.id, {
          user_metadata: { phone, full_name: fullName || undefined }
        });
      } catch {
        /* metadata sync is best-effort */
      }
    }

    res.json({ ok: true, phone });
  } catch (err) {
    await auditAuth('save_phone_error', err.message || 'save-phone failed', {
      stack: err.stack || null
    });
    return res.status(500).json({ error: USER_MSG.registerFailed });
  }
});

/** Check whether a phone is already registered (for register form UX). */
authRouter.get('/phone-available', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.query.phone || '');
    if (!isValidE164(phone)) return res.status(400).json({ error: USER_MSG.invalidPhone });

    const sb = getSupabaseAdmin();
    let exists = false;

    if (hasDatabaseUrl()) {
      const { rows } = await dbQuery(
        `select 1 from public.profiles
          where phone = $1
             or regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g')
                = regexp_replace($1, '[^0-9]', '', 'g')
          limit 1`,
        [phone]
      );
      exists = rows.length > 0;
    } else {
      const { data } = await sb.from('profiles').select('id').eq('phone', phone).maybeSingle();
      exists = Boolean(data);
    }

    res.json({ phone, available: !exists });
  } catch (err) {
    await auditAuth('phone_available_error', err.message || 'phone-available failed', {
      stack: err.stack || null
    });
    return res.status(500).json({ error: USER_MSG.badRequest });
  }
});
