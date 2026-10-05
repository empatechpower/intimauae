import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { t } from '../lib/i18n';

function redirectAfterLogin(isAdmin, from) {
  if (typeof from === 'string' && from.startsWith('/')) {
    if (from.startsWith('/admin')) return isAdmin ? from : '/account';
    if (from.startsWith('/account') || from.startsWith('/checkout')) return from;
  }
  return isAdmin ? '/admin' : '/account';
}

export function LoginPage() {
  const { lang, session, authReady, isAdmin, profileReady } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!authReady || !session || !profileReady) return;
    nav(redirectAfterLogin(isAdmin, from), { replace: true });
  }, [authReady, session, isAdmin, profileReady, nav, from]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!supabase) return setErr('Supabase not configured');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    // Redirect runs in useEffect once session + profile are ready (keeps deep links).
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
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0 }}>{t(lang, 'login')}</h1>
        {typeof from === 'string' && from.startsWith('/checkout') && (
          <p className="muted" style={{ marginTop: 0 }}>
            Log in or create an account to complete your purchase.
          </p>
        )}
        <label>{t(lang, 'email')}</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>{t(lang, 'password')}</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p style={{ color: '#f87171' }}>{err}</p>}
        <button className="btn-pink" style={{ width: '100%' }} type="submit">
          {t(lang, 'login')}
        </button>
        <p style={{ marginTop: 14 }}>
          <Link to="/forgot-password">{t(lang, 'forgotPassword')}</Link>
          {' · '}
          <Link to="/register" state={from ? { from } : undefined}>
            {t(lang, 'register')}
          </Link>
        </p>
      </form>
    </main>
  );
}

export function RegisterPage() {
  const { lang, session, authReady, isAdmin, profileReady } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (!authReady || !session || !profileReady) return;
    nav(redirectAfterLogin(isAdmin, from), { replace: true });
  }, [authReady, session, isAdmin, profileReady, nav, from]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!supabase) return setErr('Supabase not configured');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) setErr(error.message);
    else if (data?.session) {
      // Email confirmation disabled — session exists; redirect runs in useEffect
      setOk('Account created. Redirecting…');
    } else {
      setOk('Check your email to confirm your account, then log in.');
      setTimeout(() => nav('/login', { state: from ? { from } : undefined }), 1200);
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
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0 }}>{t(lang, 'register')}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Create an account to checkout and track your orders.
        </p>
        <label>{t(lang, 'fullName')}</label>
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <label>{t(lang, 'email')}</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>{t(lang, 'password')}</label>
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p style={{ color: '#f87171' }}>{err}</p>}
        {ok && <p style={{ color: '#4ade80' }}>{ok}</p>}
        <button className="btn-pink" style={{ width: '100%' }} type="submit">
          {t(lang, 'register')}
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
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!supabase) return setErr('Supabase not configured');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`
    });
    if (error) setErr(error.message);
    else setMsg('If that email exists, we sent a reset link.');
  }

  return (
    <main className="page-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0 }}>{t(lang, 'forgotPassword')}</h1>
        <label>{t(lang, 'email')}</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {err && <p style={{ color: '#f87171' }}>{err}</p>}
        {msg && <p style={{ color: '#4ade80' }}>{msg}</p>}
        <button className="btn-pink" style={{ width: '100%' }} type="submit">
          Send reset link
        </button>
        <p style={{ marginTop: 14 }}>
          <Link to="/login">{t(lang, 'login')}</Link>
        </p>
      </form>
    </main>
  );
}
