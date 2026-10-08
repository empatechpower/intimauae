import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { t } from '../lib/i18n';
import { api } from '../lib/api';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { isValidE164, normalizePhone } from '../lib/phone';
import { friendlyAuthError } from '../lib/userErrors';

function redirectAfterLogin(isAdmin, from) {
  if (typeof from === 'string' && from.startsWith('/')) {
    if (from.startsWith('/admin')) return isAdmin ? from : '/account';
    if (from.startsWith('/account') || from.startsWith('/checkout')) return from;
  }
  return isAdmin ? '/admin' : '/account';
}

/** Customer login — phone OTP only */
export function LoginPage() {
  const { lang, session, authReady, isAdmin, profileReady } = useApp();
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmationRef = useRef(null);
  const recaptchaRef = useRef(null);

  useEffect(() => {
    if (!authReady || !session || !profileReady) return;
    // Admins who somehow land here go to admin; customers stay on storefront paths
    if (isAdmin && typeof from === 'string' && from.startsWith('/admin')) {
      nav(from, { replace: true });
      return;
    }
    nav(redirectAfterLogin(false, from), { replace: true });
  }, [authReady, session, isAdmin, profileReady, nav, from]);

  useEffect(() => {
    return () => {
      try {
        recaptchaRef.current?.clear?.();
      } catch {
        /* ignore */
      }
      recaptchaRef.current = null;
    };
  }, []);

  async function ensureRecaptcha() {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('otp_send_failed');
    if (recaptchaRef.current) return recaptchaRef.current;
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible'
    });
    return recaptchaRef.current;
  }

  async function sendOtp(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!isFirebaseConfigured()) throw new Error('otp_send_failed');
      const e164 = normalizePhone(phone);
      if (!isValidE164(e164)) throw new Error('invalid_phone');
      const auth = getFirebaseAuth();
      const verifier = await ensureRecaptcha();
      confirmationRef.current = await signInWithPhoneNumber(auth, e164, verifier);
      setOtpSent(true);
      toastSuccess('Code sent. Check your SMS.');
    } catch (error) {
      toastError(friendlyAuthError(error, 'otp_send_failed'));
      try {
        recaptchaRef.current?.clear?.();
      } catch {
        /* ignore */
      }
      recaptchaRef.current = null;
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!confirmationRef.current) throw new Error('otp_needed');
      if (!supabase) throw new Error('login_failed');
      const result = await confirmationRef.current.confirm(String(otp).trim());
      const idToken = await result.user.getIdToken();
      const data = await api('/api/auth/phone-login', {
        method: 'POST',
        body: { idToken }
      });
      const { error } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'email'
      });
      if (error) throw error;
      toastSuccess('Logged in successfully.');
    } catch (error) {
      toastError(friendlyAuthError(error, 'otp_invalid'));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady || (session && !profileReady)) {
    return (
      <main className="page-wrap">
        <div className="auth-gate">Restoring session…</div>
      </main>
    );
  }

  if (session) {
    return (
      <main className="page-wrap">
        <div className="auth-gate">Redirecting…</div>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <form className="auth-card" onSubmit={otpSent ? verifyOtp : sendOtp}>
        <h1 style={{ marginTop: 0 }}>{t(lang, 'login')}</h1>
        {location.state?.registered && (
          <p className="muted" style={{ marginTop: 0, color: '#4ade80' }}>
            Account created. Enter your phone number to receive a login code.
          </p>
        )}
        {typeof from === 'string' && from.startsWith('/checkout') && (
          <p className="muted" style={{ marginTop: 0 }}>
            Log in or create an account to complete your purchase.
          </p>
        )}
        <p className="muted" style={{ marginTop: 0 }}>
          We send a one-time code to your phone. You’ll stay signed in for about 30 days.
        </p>
        <label>{t(lang, 'phone')}</label>
        <input
          type="tel"
          required
          placeholder="05xxxxxxxx or +9715xxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={otpSent || busy}
        />
        {otpSent && (
          <>
            <label>{t(lang, 'otpCode')}</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={8}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              disabled={busy}
            />
          </>
        )}
        <div id="recaptcha-container" />
        <button className="btn-pink" style={{ width: '100%' }} type="submit" disabled={busy}>
          {busy ? 'Please wait…' : otpSent ? t(lang, 'verifyOtp') : t(lang, 'sendOtp')}
        </button>
        {otpSent && (
          <button
            type="button"
            className="btn-ghost"
            style={{ width: '100%', marginTop: 10 }}
            disabled={busy}
            onClick={() => {
              setOtpSent(false);
              setOtp('');
              confirmationRef.current = null;
              toastInfo('Enter your number to request a new code.');
            }}
          >
            Change number / resend
          </button>
        )}
        <p style={{ marginTop: 14 }}>
          <Link to="/register" state={from ? { from } : undefined}>
            {t(lang, 'register')}
          </Link>
        </p>
      </form>
    </main>
  );
}

/** Admin-only email/password login at /admin/login */
export function AdminLoginPage() {
  const { session, authReady, isAdmin, profileReady } = useApp();
  const { error: toastError, success: toastSuccess } = useToast();
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authReady || !session || !profileReady) return;
    if (isAdmin) {
      const dest =
        typeof from === 'string' && from.startsWith('/admin') && from !== '/admin/login'
          ? from
          : '/admin';
      nav(dest, { replace: true });
      return;
    }
    // Logged-in non-admin must not use admin area
    nav('/account', { replace: true });
  }, [authReady, session, isAdmin, profileReady, nav, from]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!supabase) throw new Error('login_failed');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toastSuccess('Welcome back.');
    } catch (error) {
      toastError(friendlyAuthError(error, 'login_failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady || (session && !profileReady)) {
    return (
      <main className="page-wrap">
        <div className="auth-gate">Restoring session…</div>
      </main>
    );
  }

  if (session && isAdmin) {
    return (
      <main className="page-wrap">
        <div className="auth-gate">Redirecting…</div>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0 }}>Admin login</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in with your admin email and password.
        </p>
        <label>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <label>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <button className="btn-pink" style={{ width: '100%' }} type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Log in'}
        </button>
        <p style={{ marginTop: 14 }}>
          <Link to="/forgot-password">Forgot password</Link>
        </p>
      </form>
    </main>
  );
}

export function RegisterPage() {
  const { lang, session, authReady, isAdmin, profileReady } = useApp();
  const { error: toastError, success: toastSuccess } = useToast();
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  /** While finishing signup we may briefly have a session — do not auto-redirect to account. */
  const [blockingAutoLogin, setBlockingAutoLogin] = useState(false);

  useEffect(() => {
    if (blockingAutoLogin) return;
    if (!authReady || !session || !profileReady) return;
    nav(redirectAfterLogin(isAdmin, from), { replace: true });
  }, [authReady, session, isAdmin, profileReady, nav, from, blockingAutoLogin]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setBlockingAutoLogin(true);
    try {
      if (!supabase) throw new Error('register_failed');
      const e164 = normalizePhone(phone);
      if (!isValidE164(e164)) throw new Error('invalid_phone');

      try {
        const check = await api(`/api/auth/phone-available?phone=${encodeURIComponent(e164)}`);
        if (check && check.available === false) {
          throw new Error('phone_taken');
        }
      } catch (checkErr) {
        if (String(checkErr?.message || '').includes('already') || checkErr?.message === 'phone_taken') {
          throw checkErr;
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone: e164 },
          emailRedirectTo: undefined
        }
      });
      if (error) throw error;

      // Save phone via API (Postgres). Do not leave the user logged in after register.
      await api('/api/auth/save-phone', {
        method: 'POST',
        body: { email, phone: e164, full_name: fullName }
      });

      if (data?.session || supabase) {
        await supabase.auth.signOut();
      }

      toastSuccess('Account created. Log in with your phone number to continue.');
      nav('/login', { replace: true, state: from ? { from, registered: true } : { registered: true } });
    } catch (error) {
      // If signup created a session then failed later, still clear it
      try {
        await supabase?.auth.signOut();
      } catch {
        /* ignore */
      }
      setBlockingAutoLogin(false);
      toastError(friendlyAuthError(error, 'register_failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady || (session && !profileReady && !blockingAutoLogin)) {
    return (
      <main className="page-wrap">
        <div className="auth-gate">Restoring session…</div>
      </main>
    );
  }

  if (session && !blockingAutoLogin) {
    return (
      <main className="page-wrap">
        <div className="auth-gate">Redirecting…</div>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0 }}>{t(lang, 'register')}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Create an account with your details. After that you’ll log in with your phone number and SMS code — you won’t stay logged in from registration alone.
        </p>
        <label>{t(lang, 'fullName')}</label>
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={busy} />
        <label>{t(lang, 'email')}</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <label>{t(lang, 'phone')}</label>
        <input
          type="tel"
          required
          placeholder="05xxxxxxxx or +9715xxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={busy}
        />
        <label>{t(lang, 'password')}</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <button className="btn-pink" style={{ width: '100%' }} type="submit" disabled={busy}>
          {busy ? 'Please wait…' : t(lang, 'register')}
        </button>
        <p style={{ marginTop: 14 }}>
          <Link to="/login" state={from ? { from } : undefined}>
            {t(lang, 'login')}
          </Link>
        </p>
      </form>
    </main>
  );
}

export function ForgotPasswordPage() {
  const { lang } = useApp();
  const { error: toastError, success: toastSuccess } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!supabase) throw new Error('generic');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/login`
      });
      if (error) throw error;
      toastSuccess('If that email exists, we sent a reset link.');
    } catch (error) {
      toastError(friendlyAuthError(error, 'generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0 }}>{t(lang, 'forgotPassword')}</h1>
        <label>{t(lang, 'email')}</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <button className="btn-pink" style={{ width: '100%' }} type="submit" disabled={busy}>
          Send reset link
        </button>
        <p style={{ marginTop: 14 }}>
          <Link to="/admin/login">Admin login</Link>
          {' · '}
          <Link to="/login">{t(lang, 'login')}</Link>
        </p>
      </form>
    </main>
  );
}
