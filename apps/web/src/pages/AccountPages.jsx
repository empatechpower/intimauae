import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { formatMoney, t } from '../lib/i18n';

function AuthGate() {
  return <div className="auth-gate">Restoring session…</div>;
}

function RequireAuth({ children }) {
  const { session, authReady, profileReady } = useApp();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  if (!authReady) return <AuthGate />;
  if (!session) {
    return <Navigate to="/login" replace state={{ from: returnTo }} />;
  }
  if (!profileReady) return <AuthGate />;
  return children;
}

function AccountShell() {
  const { lang, session, isAdmin } = useApp();
  const nav = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const items = [
    ['orders', t(lang, 'myOrders')],
    ['address', t(lang, 'shippingAddress')],
    ['coupons', t(lang, 'myCoupon')],
    ['password', t(lang, 'changePassword')],
    ['messages', t(lang, 'myMessage')]
  ];

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    nav('/');
  }

  return (
    <div className="acct">
      <div className="acct-crumb">Home / My Account</div>
      <div className="acct-layout">
        <button type="button" className="acct-nav-toggle" onClick={() => setNavOpen((v) => !v)}>
          {navOpen ? 'Close menu' : 'Account menu'}
        </button>
        <aside className={`acct-side ${navOpen ? 'is-open' : ''}`}>
          <div className="acct-side__head">
            <h3>My Account</h3>
            <p>{session?.user?.email}</p>
          </div>
          <nav className="acct-nav" onClick={() => setNavOpen(false)}>
            {items.map(([path, label]) => (
              <NavLink key={path} to={`/account/${path}`} className={({ isActive }) => (isActive ? 'active' : '')}>
                {label}
              </NavLink>
            ))}
            {isAdmin && (
              <Link to="/admin" className="acct-admin">
                Admin Dashboard
              </Link>
            )}
          </nav>
          <button type="button" className="acct-logout" onClick={logout}>
            {t(lang, 'logout')}
          </button>
        </aside>
        <section className="acct-main">
          <Outlet />
        </section>
      </div>
      <nav className="acct-mobile-tabs" aria-label="Account sections">
        {items.map(([path, label]) => (
          <NavLink key={path} to={`/account/${path}`} className={({ isActive }) => (isActive ? 'active' : '')}>
            {label.split(' ').slice(-1)[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function OrdersPanel() {
  const { lang, token, currency } = useApp();
  const [tab, setTab] = useState('all');
  const [orders, setOrders] = useState([]);
  const tabs = ['all', 'unpaid', 'pending', 'shipped', 'success'];

  useEffect(() => {
    if (!token) return;
    api(`/api/orders/mine?status=${tab}`, { token })
      .then((d) => setOrders(d.orders || []))
      .catch(() => setOrders([]));
  }, [tab, token]);

  return (
    <div className="acct-panel">
      <header className="acct-panel__head">
        <h2>{t(lang, 'myOrders')}</h2>
        <p>Track payments and shipments for your Intimauae orders.</p>
      </header>
      <div className="acct-tabs">
        {tabs.map((k) => (
          <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {t(lang, k)}
          </button>
        ))}
      </div>
      {!orders.length ? (
        <div className="acct-empty">
          <strong>{t(lang, 'noOrders')}</strong>
          <Link className="btn-pink" to="/catalogs">
            Browse catalog
          </Link>
        </div>
      ) : (
        <div className="acct-order-list">
          {orders.map((o) => (
            <article key={o.id} className="acct-order">
              <div>
                <strong>#{o.id.slice(0, 8)}</strong>
                <span className={`adm-badge adm-badge--${o.status}`}>{o.status}</span>
              </div>
              <p>
                {formatMoney(o.total_aed, currency)} · {new Date(o.created_at).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function AddressPanel() {
  const { session } = useApp();
  const [form, setForm] = useState({ line1: '', line2: '', city: '', country: 'AE', phone: '', full_name: '', postal_code: '' });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !session) return;
    supabase
      .from('addresses')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          const a = data[0];
          setForm({
            line1: a.line1 || '',
            line2: a.line2 || '',
            city: a.city || '',
            country: a.country || 'AE',
            phone: a.phone || '',
            full_name: a.full_name || '',
            postal_code: a.postal_code || ''
          });
        }
      });
  }, [session]);

  async function save(e) {
    e.preventDefault();
    if (!supabase || !session) return;
    setSaving(true);
    setMsg('');
    const { error } = await supabase.from('addresses').insert({ ...form, user_id: session.user.id, is_default: true });
    setMsg(error ? error.message : 'Shipping address saved.');
    setSaving(false);
  }

  return (
    <div className="acct-panel">
      <header className="acct-panel__head">
        <h2>Shipping address</h2>
        <p>Used as the default delivery details at checkout.</p>
      </header>
      <form className="acct-form" onSubmit={save}>
        <div className="acct-form-grid">
          <label>
            Full name
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="acct-span-2">
            Address line 1
            <input required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          </label>
          <label className="acct-span-2">
            Apartment / suite
            <input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
          </label>
          <label>
            City
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>
            Postal code
            <input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
          </label>
          <label>
            Country
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </label>
        </div>
        <button className="btn-pink" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save address'}
        </button>
        {msg && <p className="acct-msg">{msg}</p>}
      </form>
    </div>
  );
}

function CouponsPanel() {
  return (
    <div className="acct-panel">
      <header className="acct-panel__head">
        <h2>My coupon</h2>
        <p>Apply these codes at checkout for an instant discount.</p>
      </header>
      <div className="acct-coupon">
        <strong>INTIMA15</strong>
        <span>15% off your order</span>
      </div>
    </div>
  );
}

function PasswordPanel() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    if (password.length < 6) return setMsg('Password must be at least 6 characters.');
    if (password !== confirm) return setMsg('Passwords do not match.');
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setMsg(error ? error.message : 'Password updated successfully.');
    if (!error) {
      setPassword('');
      setConfirm('');
    }
    setSaving(false);
  }

  return (
    <div className="acct-panel">
      <header className="acct-panel__head">
        <h2>Change password</h2>
        <p>Choose a strong password you do not use elsewhere.</p>
      </header>
      <form className="acct-form acct-form--narrow" onSubmit={save}>
        <label>
          New password
          <input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Confirm password
          <input type="password" minLength={6} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button className="btn-pink" type="submit" disabled={saving}>
          {saving ? 'Updating…' : 'Update password'}
        </button>
        {msg && <p className="acct-msg">{msg}</p>}
      </form>
    </div>
  );
}

function MessagesPanel() {
  const { session } = useApp();
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    if (!supabase || !session) return;
    supabase
      .from('messages')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setMessages(data || []));
  }, [session]);

  return (
    <div className="acct-panel">
      <header className="acct-panel__head">
        <h2>My messages</h2>
        <p>Support replies and order notes appear here.</p>
      </header>
      {!messages.length ? (
        <div className="acct-empty">
          <strong>No messages yet.</strong>
        </div>
      ) : (
        <div className="acct-order-list">
          {messages.map((m) => (
            <article key={m.id} className="acct-order">
              <strong>{m.subject || 'Message'}</strong>
              <p>{m.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountRoutes() {
  return (
    <RequireAuth>
      <Routes>
        <Route path="/*" element={<AccountShell />}>
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<OrdersPanel />} />
          <Route path="address" element={<AddressPanel />} />
          <Route path="coupons" element={<CouponsPanel />} />
          <Route path="password" element={<PasswordPanel />} />
          <Route path="messages" element={<MessagesPanel />} />
          <Route path="*" element={<Navigate to="orders" replace />} />
        </Route>
      </Routes>
    </RequireAuth>
  );
}
