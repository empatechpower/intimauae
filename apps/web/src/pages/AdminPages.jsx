import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, uploadAdminImage } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../lib/i18n';
import { media } from '../lib/media';
import RichEditor from '../components/RichEditor';

function money(n) {
  return formatMoney(Number(n || 0));
}

function Pager({ page, totalPages, onChange, total, pageSize }) {
  if (totalPages <= 1) return null;
  const window = 5;
  let start = Math.max(1, page - Math.floor(window / 2));
  let end = Math.min(totalPages, start + window - 1);
  start = Math.max(1, end - window + 1);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="adm-pager">
      <span className="adm-muted">
        Page {page} of {totalPages}
        {total != null ? ` · ${total} total` : ''}
        {pageSize ? ` · ${pageSize}/page` : ''}
      </span>
      <div className="adm-pager__btns">
        <button type="button" className="adm-btn adm-btn--ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Prev
        </button>
        {start > 1 && (
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => onChange(1)}>
            1
          </button>
        )}
        {start > 2 && <span className="adm-muted">…</span>}
        {pages.map((p) => (
          <button key={p} type="button" className={`adm-btn ${p === page ? 'adm-btn--primary' : 'adm-btn--ghost'}`} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
        {end < totalPages - 1 && <span className="adm-muted">…</span>}
        {end < totalPages && (
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => onChange(totalPages)}>
            {totalPages}
          </button>
        )}
        <button type="button" className="adm-btn adm-btn--ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function useClientPager(items, pageSize = 12, resetKey = '') {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / pageSize));
  useEffect(() => {
    setPage(1);
  }, [pageSize, resetKey, items?.length]);
  const safePage = Math.min(page, totalPages);
  const pageItems = (items || []).slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, setPage, totalPages, pageItems, pageSize };
}


function AuthGate({ children }) {
  return <div className="auth-gate">Restoring session…</div>;
}

function RequireAdmin({ children }) {
  const { session, isAdmin, authReady, profileReady } = useApp();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  if (!authReady) return <AuthGate />;
  if (!session) {
    return <Navigate to="/login" replace state={{ from: returnTo }} />;
  }
  if (!profileReady) return <AuthGate />;
  if (!isAdmin) return <Navigate to="/account" replace />;
  return children;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function ImageField({ urls, onChange, token, single = false }) {
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const res = await uploadAdminImage(file, token);
      onChange(single ? [res.url] : [...(urls || []), res.url]);
    } catch (ex) {
      setErr(ex.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function addUrl() {
    const u = urlInput.trim();
    if (!u) return;
    onChange(single ? [u] : [...(urls || []), u]);
    setUrlInput('');
  }

  function removeAt(i) {
    onChange((urls || []).filter((_, idx) => idx !== i));
  }

  return (
    <div className="adm-media">
      <div className="adm-media__previews">
        {(urls || []).map((u, i) => (
          <div key={`${u}-${i}`} className="adm-media__item">
            <img src={media(u)} alt="" />
            <button type="button" onClick={() => removeAt(i)} aria-label="Remove">
              ×
            </button>
          </div>
        ))}
        {!urls?.length && <div className="adm-media__empty">No images yet — upload or paste a URL</div>}
      </div>
      <div className="adm-media__actions">
        <label className="adm-btn adm-btn--ghost adm-btn--file">
          {busy ? 'Uploading…' : 'Upload image'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={onFile} />
        </label>
        <div className="adm-media__url">
          <input placeholder="Or paste image URL" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
          <button type="button" className="adm-btn adm-btn--ghost" onClick={addUrl}>
            Add URL
          </button>
        </div>
      </div>
      {err && (
        <p className="adm-error" style={{ marginTop: 10 }}>
          {err}
        </p>
      )}
    </div>
  );
}

function AdminShell() {
  const { session } = useApp();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ['', 'Dashboard', '◈'],
    ['products', 'Products', '▣'],
    ['orders', 'Orders', '☰'],
    ['customers', 'Customers', '☺'],
    ['messages', 'Messages', '✉'],
    ['audits', 'Audit', '⌘'],
    ['discounts', 'Discounts', '%'],
    ['warehouses', 'Warehouses', '⌂'],
    ['blog', 'Blog', '✎'],
    ['settings', 'Settings', '⚙']
  ];

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    nav('/login');
  }

  return (
    <div className={`adm ${menuOpen ? 'adm--nav-open' : ''} notranslate`} translate="no">
      <button type="button" className="adm-menu-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
        ☰
      </button>
      <aside className="adm-side" onClick={() => setMenuOpen(false)}>
        <div className="adm-brand">
          <span>Intimauae</span>
          <small>Commerce Admin</small>
        </div>
        <nav className="adm-nav">
          {links.map(([path, label, icon]) => (
            <NavLink
              key={path || 'dash'}
              to={path ? `/admin/${path}` : '/admin'}
              end={!path}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="adm-nav__icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="adm-side-foot">
          <div className="adm-user">{session?.user?.email}</div>
          <Link to="/">← Storefront</Link>
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <div className="adm-main">
        <Outlet />
      </div>
      {menuOpen && <button type="button" className="adm-backdrop" aria-label="Close" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="adm-stat">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
      {hint ? <div className="adm-stat-hint">{hint}</div> : null}
    </div>
  );
}

function Dash() {
  const { token } = useApp();
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api('/api/admin/overview', { token })
      .then((d) => {
        if (!cancelled) setOv(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const dailySeries = useMemo(() => {
    const map = Object.fromEntries((ov?.daily || []).map((d) => [d.day, d]));
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date();
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() - i);
      const day = dt.toISOString().slice(0, 10);
      out.push(map[day] || { day, orders: 0, revenue: 0 });
    }
    return out;
  }, [ov]);

  const maxDaily = useMemo(() => Math.max(1, ...dailySeries.map((d) => Number(d.revenue) || 0)), [dailySeries]);
  const hasRevenue = dailySeries.some((d) => Number(d.revenue) > 0);

  if (err) {
    return (
      <div className="adm-page">
        <p className="adm-error">{err}</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p className="adm-muted">{ov ? `Live database · ${ov.source}` : 'Loading store metrics…'}</p>
        </div>
      </div>

      <div className="adm-stats">
        <StatCard label="Revenue" value={ov ? money(ov.revenue) : '—'} hint={ov ? `Paid ${money(ov.paid_revenue)}` : ''} />
        <StatCard label="Orders" value={ov?.orders ?? '—'} hint={ov ? `${ov.status_counts?.unpaid || 0} unpaid` : ''} />
        <StatCard label="Products" value={ov?.products ?? '—'} hint="Active catalog" />
        <StatCard label="Customers" value={ov?.customers ?? '—'} hint={ov ? `${ov.coupons || 0} coupons` : ''} />
      </div>

      <div className="adm-dash-row">
        <section className="adm-panel">
          <h2>Order pipeline</h2>
          <div className="adm-pipeline">
            {['unpaid', 'pending', 'shipped', 'success'].map((k) => (
              <div key={k}>
                <strong>{ov?.status_counts?.[k] ?? '—'}</strong>
                <span>{k}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="adm-panel">
          <h2>Last 14 days revenue</h2>
          {hasRevenue ? (
            <div className="adm-bars" role="img" aria-label="Revenue last 14 days">
              {dailySeries.map((d) => (
                <div key={d.day} className="adm-bar" title={`${d.day}: ${money(d.revenue)}`}>
                  <div style={{ height: `${Math.max(4, (Number(d.revenue) / maxDaily) * 100)}%` }} />
                  <span>{String(d.day).slice(8)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="adm-muted">{ov ? 'No revenue in the last 14 days yet.' : '…'}</p>
          )}
        </section>
      </div>

      <div className="adm-dash-row">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Recent orders</h2>
            <Link to="/admin/orders">View all</Link>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(ov?.recent_orders || []).map((o) => (
                  <tr key={o.id}>
                    <td>#{String(o.id).slice(0, 8)}</td>
                    <td className="adm-ellipsis">{o.email || '—'}</td>
                    <td>
                      <span className={`adm-badge adm-badge--${o.status}`}>{o.status}</span>
                    </td>
                    <td>{money(o.total_aed)}</td>
                  </tr>
                ))}
                {ov && !ov.recent_orders?.length && (
                  <tr>
                    <td colSpan={4} className="adm-muted">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="adm-panel">
          <h2>Top sellers</h2>
          <ul className="adm-sellers">
            {(ov?.top_products || []).map((p) => (
              <li key={p.handle || p.title}>
                <div>
                  <strong className="adm-ellipsis">{p.title || p.handle}</strong>
                  <span>{p.units} sold</span>
                </div>
                <em>{money(p.revenue)}</em>
              </li>
            ))}
            {ov && !ov.top_products?.length && <li className="adm-muted">No sales data yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ProductsList() {
  const { token } = useApp();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api('/api/admin/products', { token }),
        api('/api/admin/categories', { token }).catch(() => ({ categories: [] }))
      ]);
      setProducts(prodRes.products || []);
      setCategories(catRes.categories || []);
      setMsg('');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = products.filter((p) => {
    if (cat !== 'all' && p.category_id !== cat) return false;
    if (status === 'active' && p.active === false) return false;
    if (status === 'hidden' && p.active !== false) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [p.title, p.handle, p.category_id, p.warehouse].join(' ').toLowerCase().includes(s);
  });
  const { page, setPage, totalPages, pageItems, pageSize } = useClientPager(filtered, 12, `${q}|${cat}|${status}`);

  async function toggleActive(p) {
    await api(`/api/admin/products/${p.id}`, { method: 'PATCH', token, body: { active: !p.active } });
    await load();
  }

  async function remove(p) {
    if (!confirm(`Delete ${p.title}?`)) return;
    await api(`/api/admin/products/${p.id}`, { method: 'DELETE', token });
    await load();
  }

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Products</h1>
          <p className="adm-muted">
            {filtered.length} shown · {products.length} total
          </p>
        </div>
        <div className="adm-head__actions">
          <input className="adm-search" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="adm-search" value={cat} onChange={(e) => setCat(e.target.value)} style={{ minWidth: 140 }}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_en}
              </option>
            ))}
          </select>
          <select className="adm-search" value={status} onChange={(e) => setStatus(e.target.value)} style={{ minWidth: 120 }}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </select>
          <Link className="adm-btn adm-btn--primary" to="/admin/products/new">
            + Add product
          </Link>
        </div>
      </div>
      {msg && <p className="adm-error">{msg}</p>}
      {loading ? (
        <p className="adm-muted">Loading products…</p>
      ) : (
        <div className="adm-product-grid">
          {pageItems.map((p) => {
            const img = p.images?.[0] || p.product_images?.[0]?.url || '';
            return (
              <article key={p.id} className="adm-product-card">
                <div className="adm-product-card__media">{img ? <img src={media(img)} alt="" /> : <span>No image</span>}</div>
                <div className="adm-product-card__body">
                  <div className="adm-product-card__top">
                    <span className={`adm-badge ${p.active === false ? 'adm-badge--cancelled' : 'adm-badge--success'}`}>
                      {p.active === false ? 'Hidden' : 'Active'}
                    </span>
                    <span className="adm-chip">{p.category_id}</span>
                  </div>
                  <h3>{p.title}</h3>
                  <p className="adm-muted">/{p.handle}</p>
                  <div className="adm-product-card__meta">
                    <strong>{money(p.price_aed ?? p.price)}</strong>
                    <span>Stock {p.stock ?? '—'}</span>
                  </div>
                  <div className="adm-product-card__actions">
                    <Link className="adm-btn adm-btn--primary" to={`/admin/products/${p.id}`}>
                      Edit
                    </Link>
                    <button type="button" className="adm-btn adm-btn--ghost" onClick={() => toggleActive(p)}>
                      {p.active === false ? 'Show' : 'Hide'}
                    </button>
                    <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(p)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!filtered.length && <div className="adm-empty">No products match these filters.</div>}
        </div>
      )}
      <Pager page={page} totalPages={totalPages} onChange={setPage} total={filtered.length} pageSize={pageSize} />
    </div>
  );
}

function CategoryPicker({ token, value, onChange }) {
  const [categories, setCategories] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [catErr, setCatErr] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  async function loadCategories() {
    try {
      const d = await api('/api/admin/categories', { token });
      setCategories(d.categories || []);
    } catch {
      setCategories([
        { id: 'full-body', name_en: 'Full Body Products' },
        { id: 'partial-body', name_en: 'Partial Body Products' },
        { id: 'trunk', name_en: 'Trunk' }
      ]);
    }
  }

  useEffect(() => {
    loadCategories();
  }, [token]);

  async function saveNewCategory() {
    const name = newName.trim();
    if (!name) return setCatErr('Enter a category name');
    setCatBusy(true);
    setCatErr('');
    try {
      const d = await api('/api/admin/categories', { method: 'POST', token, body: { name_en: name } });
      const cat = d.category;
      await loadCategories();
      onChange(cat.id);
      setNewName('');
      setAdding(false);
    } catch (e) {
      setCatErr(e.message || 'Failed to save category');
    } finally {
      setCatBusy(false);
    }
  }

  return (
    <div className="adm-category-picker">
      <select
        value={adding ? '__new__' : value || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__new__') {
            setAdding(true);
            setCatErr('');
          } else {
            setAdding(false);
            onChange(v);
          }
        }}
      >
        {!categories.length && <option value="">Loading…</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name_en}
          </option>
        ))}
        <option value="__new__">+ Add new category…</option>
      </select>
      {adding && (
        <div className="adm-category-picker__new">
          <input
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveNewCategory();
              }
            }}
          />
          <button type="button" className="adm-btn adm-btn--primary" disabled={catBusy} onClick={saveNewCategory}>
            {catBusy ? 'Saving…' : 'Save category'}
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={() => {
              setAdding(false);
              setNewName('');
              setCatErr('');
            }}
          >
            Cancel
          </button>
          {catErr && <p className="adm-msg adm-msg--err">{catErr}</p>}
        </div>
      )}
    </div>
  );
}

const emptyProduct = {
  handle: '',
  title: '',
  category_id: 'full-body',
  price_aed: '',
  compare_at_aed: '',
  warehouse: 'UAE Warehouse',
  stock: '50',
  description: '',
  height: '',
  material: '',
  skeleton: '',
  tags: '',
  images: [],
  active: true,
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  slug_canonical: ''
};

function ProductEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { token } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState(emptyProduct);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) {
      setForm(emptyProduct);
      setLoading(false);
      return;
    }
    setLoading(true);
    api(`/api/admin/products/${id}`, { token })
      .then((d) => {
        const p = d.product;
        setForm({
          handle: p.handle || '',
          title: p.title || '',
          category_id: p.category_id || 'full-body',
          price_aed: String(p.price_aed ?? p.price ?? ''),
          compare_at_aed: String(p.compare_at_aed ?? p.compare_at_price ?? ''),
          warehouse: p.warehouse || 'UAE Warehouse',
          stock: String(p.stock ?? 50),
          description: p.description || '',
          height: p.height || '',
          material: p.material || '',
          skeleton: p.skeleton || '',
          tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
          images: p.images || p.product_images?.map((i) => i.url) || [],
          active: p.active !== false,
          seo_title: p.seo_title || '',
          seo_description: p.seo_description || '',
          seo_keywords: p.seo_keywords || '',
          slug_canonical: p.slug_canonical || p.handle || ''
        });
      })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew, token]);

  function setField(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'title' && isNew && !f.handle) next.handle = slugify(value);
      if (key === 'handle' && !f.slug_canonical) next.slug_canonical = value;
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const body = {
        id: isNew ? undefined : Number(id),
        ...form,
        price_aed: Number(form.price_aed),
        compare_at_aed: form.compare_at_aed ? Number(form.compare_at_aed) : null,
        stock: Number(form.stock || 50),
        tags: form.tags,
        images: form.images
      };
      if (isNew) {
        await api('/api/admin/products', { method: 'POST', token, body });
      } else {
        await api('/api/admin/products', { method: 'POST', token, body: { ...body, id: Number(id) } });
      }
      nav('/admin/products');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="adm-page">
        <p className="adm-muted">Loading product…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <Link to="/admin/products" className="adm-back">
            ← Products
          </Link>
          <h1>{isNew ? 'Add product' : 'Edit product'}</h1>
          <p className="adm-muted">Upload images or paste URLs · set SEO for search</p>
        </div>
        <div className="adm-head__actions">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => nav('/admin/products')}>
            Cancel
          </button>
          <button type="submit" form="product-form" className="adm-btn adm-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save product'}
          </button>
        </div>
      </div>

      <form id="product-form" className="adm-editor" onSubmit={save}>
        <div className="adm-editor__main">
          <section className="adm-panel adm-form">
            <h2>Basics</h2>
            <div className="adm-form-grid">
              <label>
                Title
                <input required value={form.title} onChange={(e) => setField('title', e.target.value)} />
              </label>
              <label>
                Handle / URL slug
                <input required value={form.handle} onChange={(e) => setField('handle', e.target.value)} disabled={!isNew} />
              </label>
              <label>
                Price (SGD)
                <input required type="number" step="0.01" value={form.price_aed} onChange={(e) => setField('price_aed', e.target.value)} />
              </label>
              <label>
                Compare at (SGD)
                <input type="number" step="0.01" value={form.compare_at_aed} onChange={(e) => setField('compare_at_aed', e.target.value)} />
              </label>
              <label>
                Category
                <CategoryPicker token={token} value={form.category_id} onChange={(id) => setField('category_id', id)} />
              </label>
              <label>
                Warehouse
                <input value={form.warehouse} onChange={(e) => setField('warehouse', e.target.value)} />
              </label>
              <label>
                Stock
                <input type="number" value={form.stock} onChange={(e) => setField('stock', e.target.value)} />
              </label>
              <label className="adm-check">
                <input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} /> Active on storefront
              </label>
            </div>
            <label className="adm-span-2">
              Description
              <RichEditor value={form.description} onChange={(html) => setField('description', html)} placeholder="Product description…" minHeight={220} />
            </label>
            <div className="adm-form-grid">
              <label>
                Height
                <input value={form.height} onChange={(e) => setField('height', e.target.value)} />
              </label>
              <label>
                Material
                <input value={form.material} onChange={(e) => setField('material', e.target.value)} />
              </label>
              <label>
                Skeleton
                <input value={form.skeleton} onChange={(e) => setField('skeleton', e.target.value)} />
              </label>
              <label>
                Tags (comma separated)
                <input value={form.tags} onChange={(e) => setField('tags', e.target.value)} />
              </label>
            </div>
          </section>

          <section className="adm-panel adm-form" id="media">
            <h2>Media</h2>
            <p className="adm-muted" style={{ marginTop: 0 }}>
              Upload a file or paste a public image URL. First image is the cover.
            </p>
            <ImageField urls={form.images} onChange={(images) => setField('images', images)} token={token} />
          </section>

          <section className="adm-panel adm-form" id="seo">
            <h2>SEO</h2>
            <div className="adm-form-grid">
              <label>
                SEO title
                <input value={form.seo_title} onChange={(e) => setField('seo_title', e.target.value)} placeholder={form.title || 'Page title'} />
              </label>
              <label>
                Canonical slug
                <input value={form.slug_canonical} onChange={(e) => setField('slug_canonical', e.target.value)} placeholder={form.handle} />
              </label>
            </div>
            <label>
              Meta description
              <textarea rows={3} value={form.seo_description} onChange={(e) => setField('seo_description', e.target.value)} placeholder="Shown in search results" />
            </label>
            <label>
              Keywords
              <input value={form.seo_keywords} onChange={(e) => setField('seo_keywords', e.target.value)} placeholder="silicone doll, UAE, …" />
            </label>
            <div className="adm-seo-preview">
              <div className="adm-seo-preview__url">intimauae.ae/products/{form.handle || 'handle'}</div>
              <div className="adm-seo-preview__title">{form.seo_title || form.title || 'Product title'}</div>
              <div className="adm-seo-preview__desc">
                {form.seo_description || String(form.description || '').replace(/<[^>]+>/g, '').slice(0, 160) || 'Meta description preview'}
              </div>
            </div>
          </section>
        </div>
        {msg && <p className="adm-error">{msg}</p>}
      </form>
    </div>
  );
}

function OrdersAdmin() {
  const { token } = useApp();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/admin/orders', { token });
      setOrders(d.orders || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  async function setStatus(id, status) {
    await api(`/api/admin/orders/${id}`, { method: 'PATCH', token, body: { status } });
    await load();
  }

  async function remove(o) {
    if (!confirm(`Delete order #${String(o.id).slice(0, 8)}?`)) return;
    await api(`/api/admin/orders/${o.id}`, { method: 'DELETE', token });
    await load();
  }

  const list = orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [o.id, o.email, o.status].join(' ').toLowerCase().includes(s);
  });
  const { page, setPage, totalPages, pageItems, pageSize } = useClientPager(list, 15, `${filter}|${q}`);

  function exportCsv() {
    const rows = [
      ['id', 'email', 'status', 'total_usd', 'payment', 'items', 'created_at'],
      ...list.map((o) => [
        o.id,
        o.email || '',
        o.status,
        o.total_aed,
        o.payments?.[0]?.status || '',
        (o.order_items || []).length,
        o.created_at || ''
      ])
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${filter}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Orders</h1>
          <p className="adm-muted">
            {list.length} shown · {orders.length} total
          </p>
        </div>
        <div className="adm-head__actions">
          <input className="adm-search" placeholder="Search email / id…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="adm-btn adm-btn--ghost" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      <div className="adm-tabs" style={{ marginBottom: 14 }}>
        {['all', 'unpaid', 'pending', 'shipped', 'success', 'cancelled'].map((k) => (
          <button key={k} type="button" className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="adm-panel">
        {loading ? (
          <p className="adm-muted">Loading orders…</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>#{String(o.id).slice(0, 8)}</strong>
                    </td>
                    <td>{o.email || 'Guest'}</td>
                    <td>{(o.order_items || []).length || '—'}</td>
                    <td>{money(o.total_aed)}</td>
                    <td>{o.payments?.[0]?.status || '—'}</td>
                    <td>
                      <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                        {['unpaid', 'pending', 'shipped', 'success', 'cancelled'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                    <td>
                      <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(o)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={8} className="adm-muted">
                      No orders in this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pager page={page} totalPages={totalPages} onChange={setPage} total={list.length} pageSize={pageSize} />
    </div>
  );
}

function CustomersAdmin() {
  const { token } = useApp();
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/admin/customers', { token });
      setCustomers(d.customers || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  async function remove(c) {
    if (c.role === 'admin') return alert('Admin profiles cannot be deleted.');
    if (!confirm(`Delete customer ${c.email}?`)) return;
    await api(`/api/admin/customers/${c.id}`, { method: 'DELETE', token });
    await load();
  }

  const list = customers.filter((c) => {
    if (role !== 'all' && c.role !== role) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [c.email, c.full_name, c.role].join(' ').toLowerCase().includes(s);
  });
  const { page, setPage, totalPages, pageItems, pageSize } = useClientPager(list, 15, `${role}|${q}`);

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Customers</h1>
          <p className="adm-muted">
            {list.length} shown · {customers.length} profiles
          </p>
        </div>
        <div className="adm-head__actions">
          <input className="adm-search" placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="adm-search" value={role} onChange={(e) => setRole(e.target.value)} style={{ minWidth: 130 }}>
            <option value="all">All roles</option>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div className="adm-panel">
        {loading ? (
          <p className="adm-muted">Loading customers…</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Orders</th>
                  <th>Spent</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="adm-customer-cell">
                        <span className="adm-customer-cell__avatar">
                          {(c.full_name || c.email || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <strong>{c.full_name || '—'}</strong>
                      </div>
                    </td>
                    <td>{c.email || '—'}</td>
                    <td>
                      <span className={`adm-badge ${c.role === 'admin' ? 'adm-badge--pending' : 'adm-badge--success'}`}>
                        {c.role}
                      </span>
                    </td>
                    <td>{c.orders_count ?? 0}</td>
                    <td>{money(c.spent)}</td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      {c.role !== 'admin' ? (
                        <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(c)}>
                          Delete
                        </button>
                      ) : (
                        <span className="adm-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={7} className="adm-muted">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pager page={page} totalPages={totalPages} onChange={setPage} total={list.length} pageSize={pageSize} />
    </div>
  );
}

function DiscountsAdmin() {
  const { token } = useApp();
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState({ code: '', percent_off: '15', active: true });
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/admin/coupons', { token });
      setCoupons(d.coupons || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  async function create(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/admin/coupons', {
        method: 'POST',
        token,
        body: { code: form.code, percent_off: Number(form.percent_off), active: form.active }
      });
      setForm({ code: '', percent_off: '15', active: true });
      setMsg('Coupon saved.');
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function toggle(c) {
    await api(`/api/admin/coupons/${c.id}`, { method: 'PATCH', token, body: { active: !c.active } });
    await load();
  }

  async function remove(c) {
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    await api(`/api/admin/coupons/${c.id}`, { method: 'DELETE', token });
    await load();
  }

  const list = coupons.filter((c) => !q.trim() || String(c.code).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Discounts</h1>
          <p className="adm-muted">Create and manage coupon codes for checkout</p>
        </div>
        <input className="adm-search" placeholder="Search codes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="adm-split">
        <form className="adm-panel adm-form adm-split__side" onSubmit={create}>
          <h2>New coupon</h2>
          <div className="adm-form-grid">
            <label className="adm-span-2">
              Code
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="INTIMA15" />
            </label>
            <label>
              Percent off
              <input type="number" min="1" max="100" required value={form.percent_off} onChange={(e) => setForm({ ...form, percent_off: e.target.value })} />
            </label>
            <label className="adm-check" style={{ alignSelf: 'end', marginBottom: 4 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
            </label>
          </div>
          <button className="adm-btn adm-btn--primary" type="submit">
            Add coupon
          </button>
          {msg && <p className="adm-msg">{msg}</p>}
        </form>
        <div className="adm-panel adm-split__main">
          <div className="adm-panel__title-row">
            <h2>All coupons</h2>
            <span className="adm-muted">{list.length} codes</span>
          </div>
          {loading ? (
            <p className="adm-muted">Loading…</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Discount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id || c.code}>
                      <td>
                        <strong className="adm-code">{c.code}</strong>
                      </td>
                      <td>{c.percent_off}% off</td>
                      <td>
                        <span className={`adm-badge ${c.active ? 'adm-badge--success' : 'adm-badge--cancelled'}`}>
                          {c.active ? 'Active' : 'Off'}
                        </span>
                      </td>
                      <td>
                        <div className="adm-row-actions">
                          {c.id && (
                            <>
                              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => toggle(c)}>
                                {c.active ? 'Disable' : 'Enable'}
                              </button>
                              <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(c)}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td colSpan={4} className="adm-muted">
                        No coupons found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WarehousesAdmin() {
  const { token } = useApp();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', code: '', country: 'AE' });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/admin/warehouses', { token });
      setRows(d.warehouses || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  async function create(e) {
    e.preventDefault();
    await api('/api/admin/warehouses', { method: 'POST', token, body: form });
    setForm({ name: '', code: '', country: 'AE' });
    await load();
  }

  async function remove(w) {
    if (!w.id) return alert('This default warehouse has no DB id yet.');
    if (!confirm(`Delete warehouse ${w.name}?`)) return;
    await api(`/api/admin/warehouses/${w.id}`, { method: 'DELETE', token });
    await load();
  }

  const list = rows.filter((w) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [w.name, w.code, w.country].join(' ').toLowerCase().includes(s);
  });

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Warehouses</h1>
          <p className="adm-muted">Fulfillment locations used for stock and shipping</p>
        </div>
        <input className="adm-search" placeholder="Search warehouses…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="adm-split">
        <form className="adm-panel adm-form adm-split__side" onSubmit={create}>
          <h2>Add warehouse</h2>
          <div className="adm-form-grid">
            <label className="adm-span-2">
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dubai main" />
            </label>
            <label>
              Code
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DXB" />
            </label>
            <label>
              Country
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="AE" />
            </label>
          </div>
          <button className="adm-btn adm-btn--primary" type="submit">
            Save warehouse
          </button>
        </form>
        <div className="adm-panel adm-split__main">
          <div className="adm-panel__title-row">
            <h2>Locations</h2>
            <span className="adm-muted">{list.length} warehouses</span>
          </div>
          {loading ? (
            <p className="adm-muted">Loading…</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Country</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((w) => (
                    <tr key={w.id || w.code}>
                      <td>
                        <strong>{w.name}</strong>
                      </td>
                      <td>
                        <span className="adm-code">{w.code || '—'}</span>
                      </td>
                      <td>{w.country || '—'}</td>
                      <td>
                        <span className={`adm-badge ${w.active === false ? 'adm-badge--cancelled' : 'adm-badge--success'}`}>
                          {w.active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {w.id ? (
                          <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(w)}>
                            Delete
                          </button>
                        ) : (
                          <span className="adm-muted">Default</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td colSpan={5} className="adm-muted">
                        No warehouses found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function bodyToHtml(body) {
  if (typeof body === 'string') return body;
  if (Array.isArray(body)) {
    return body.map((p) => (String(p).includes('<') ? String(p) : `<p>${String(p)}</p>`)).join('');
  }
  return '';
}

function BlogList() {
  const { token } = useApp();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/admin/blog', { token });
      setPosts(d.posts || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  async function remove(p) {
    if (!confirm(`Delete blog post “${p.title}”?`)) return;
    await api(`/api/admin/blog/${p.handle}`, { method: 'DELETE', token });
    await load();
  }

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Blog</h1>
          <p className="adm-muted">{posts.length} posts · same database as the storefront</p>
        </div>
        <Link className="adm-btn adm-btn--primary" to="/admin/blog/new">
          + Add blog post
        </Link>
      </div>
      {loading ? (
        <p className="adm-muted">Loading posts…</p>
      ) : (
        <div className="adm-product-grid adm-blog-grid">
          {posts.map((p) => (
            <article key={p.handle} className="adm-product-card">
              <div className="adm-product-card__media">
                {p.image ? <img src={media(p.image)} alt="" /> : <span>No image</span>}
              </div>
              <div className="adm-product-card__body">
                <span className={`adm-badge ${p.active === false ? 'adm-badge--cancelled' : 'adm-badge--success'}`}>
                  {p.active === false ? 'Draft' : 'Live'}
                </span>
                <h3>{p.title}</h3>
                <p className="adm-muted">/{p.handle}</p>
                <div className="adm-product-card__actions">
                  <Link className="adm-btn adm-btn--primary" to={`/admin/blog/${p.handle}`}>
                    Edit
                  </Link>
                  <Link className="adm-btn adm-btn--ghost" to={`/blogs/${p.handle}`} target="_blank" rel="noreferrer">
                    View
                  </Link>
                  <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(p)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!posts.length && <div className="adm-empty">No blog posts yet. Click Add blog post.</div>}
        </div>
      )}
    </div>
  );
}

const emptyBlog = {
  handle: '',
  title: '',
  excerpt: '',
  body: '',
  image: '',
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  active: true
};

function BlogEditor() {
  const { handle } = useParams();
  const isNew = !handle || handle === 'new';
  const { token } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState(emptyBlog);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) {
      setForm(emptyBlog);
      setLoading(false);
      return;
    }
    setLoading(true);
    api('/api/admin/blog', { token })
      .then((d) => {
        const p = (d.posts || []).find((x) => x.handle === handle);
        if (!p) throw new Error('Post not found');
        setForm({
          handle: p.handle || '',
          title: p.title || '',
          excerpt: p.excerpt || '',
          body: bodyToHtml(p.body),
          image: p.image || '',
          seo_title: p.seo_title || '',
          seo_description: p.seo_description || '',
          seo_keywords: p.seo_keywords || '',
          active: p.active !== false
        });
      })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [handle, isNew, token]);

  function setField(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'title' && isNew && !f.handle) next.handle = slugify(value);
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api(`/api/admin/blog/${form.handle}`, {
        method: 'PUT',
        token,
        body: { ...form, body: form.body }
      });
      nav('/admin/blog');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="adm-page">
        <p className="adm-muted">Loading post…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <Link to="/admin/blog" className="adm-back">
            ← Blog
          </Link>
          <h1>{isNew ? 'Add blog post' : 'Edit blog post'}</h1>
          <p className="adm-muted">Rich content · cover image · SEO</p>
        </div>
        <div className="adm-head__actions">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => nav('/admin/blog')}>
            Cancel
          </button>
          <button type="submit" form="blog-form" className="adm-btn adm-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save post'}
          </button>
        </div>
      </div>

      <form id="blog-form" className="adm-editor" onSubmit={save}>
        <div className="adm-editor__main">
          <section className="adm-panel adm-form">
            <h2>Post</h2>
            <div className="adm-form-grid">
              <label>
                Title
                <input required value={form.title} onChange={(e) => setField('title', e.target.value)} />
              </label>
              <label>
                Handle
                <input required value={form.handle} onChange={(e) => setField('handle', e.target.value)} disabled={!isNew} />
              </label>
              <label className="adm-span-2">
                Excerpt
                <input value={form.excerpt} onChange={(e) => setField('excerpt', e.target.value)} />
              </label>
              <label className="adm-check">
                <input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} /> Published
              </label>
            </div>
            <label className="adm-span-2">
              Body
              <RichEditor value={form.body} onChange={(html) => setField('body', html)} placeholder="Write your post…" minHeight={280} />
            </label>
          </section>

          <section className="adm-panel adm-form">
            <h2>Cover image</h2>
            <ImageField
              single
              urls={form.image ? [form.image] : []}
              onChange={(urls) => setField('image', urls[0] || '')}
              token={token}
            />
          </section>

          <section className="adm-panel adm-form">
            <h2>SEO</h2>
            <div className="adm-form-grid">
              <label>
                SEO title
                <input value={form.seo_title} onChange={(e) => setField('seo_title', e.target.value)} placeholder={form.title} />
              </label>
              <label>
                Keywords
                <input value={form.seo_keywords} onChange={(e) => setField('seo_keywords', e.target.value)} />
              </label>
            </div>
            <label>
              Meta description
              <textarea rows={3} value={form.seo_description} onChange={(e) => setField('seo_description', e.target.value)} />
            </label>
            <div className="adm-seo-preview">
              <div className="adm-seo-preview__url">intimauae.ae/blogs/{form.handle || 'handle'}</div>
              <div className="adm-seo-preview__title">{form.seo_title || form.title || 'Post title'}</div>
              <div className="adm-seo-preview__desc">{form.seo_description || form.excerpt || 'Meta description preview'}</div>
            </div>
          </section>
        </div>
        {msg && <p className="adm-error">{msg}</p>}
      </form>
    </div>
  );
}

function AuditAdmin() {
  const { token } = useApp();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/admin/audits', { token });
      setAudits(d.audits || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  async function remove(a) {
    if (!confirm('Delete this audit entry?')) return;
    await api(`/api/admin/audits/${a.id}`, { method: 'DELETE', token });
    if (selected?.id === a.id) setSelected(null);
    await load();
  }

  const list = audits.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'errors') return a.level === 'error';
    if (filter === 'info') return a.level === 'info';
    return a.source === filter;
  });
  const { page, setPage, totalPages, pageItems, pageSize } = useClientPager(list, 15, filter);

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Audit</h1>
          <p className="adm-muted">Internal log of checkout/payment issues — customers never see these details</p>
        </div>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={() => load()}>
          Refresh
        </button>
      </div>
      <div className="adm-tabs" style={{ marginBottom: 14 }}>
        {['all', 'errors', 'info', 'payments'].map((k) => (
          <button key={k} type="button" className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="adm-split">
        <div className="adm-panel adm-split__main">
          {loading ? (
            <p className="adm-muted">Loading…</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Level</th>
                    <th>Event</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((a) => (
                    <tr
                      key={a.id}
                      className={selected?.id === a.id ? 'adm-row--active' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(a)}
                    >
                      <td>{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
                      <td>
                        <span className={`adm-badge ${a.level === 'error' ? 'adm-badge--unpaid' : 'adm-badge--success'}`}>
                          {a.level}
                        </span>
                      </td>
                      <td>
                        <code className="adm-code">{a.event}</code>
                      </td>
                      <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.message}
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td colSpan={4} className="adm-muted">
                        No audit entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} totalPages={totalPages} onChange={setPage} total={list.length} pageSize={pageSize} />
        </div>
        <div className="adm-panel adm-split__side">
          {selected ? (
            <>
              <h2>{selected.event}</h2>
              <p className="adm-muted" style={{ marginTop: 0 }}>
                {selected.source} · {selected.level}
                {selected.order_id ? ` · order ${String(selected.order_id).slice(0, 8)}` : ''}
              </p>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{selected.message}</p>
              {selected.detail != null && (
                <pre className="adm-audit-detail">{JSON.stringify(selected.detail, null, 2)}</pre>
              )}
              <div className="adm-row-actions" style={{ marginTop: 14 }}>
                <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(selected)}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="adm-muted">Select an entry to see full details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MessagesAdmin() {
  const { token } = useApp();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const d = await api('/api/admin/contact-messages', { token });
      setMessages(d.messages || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [token]);

  async function setStatus(m, status) {
    await api(`/api/admin/contact-messages/${m.id}`, { method: 'PATCH', token, body: { status } });
    await load();
    setSelected((cur) => (cur?.id === m.id ? { ...cur, status } : cur));
  }

  async function remove(m) {
    if (!confirm(`Delete message from ${m.email}?`)) return;
    await api(`/api/admin/contact-messages/${m.id}`, { method: 'DELETE', token });
    if (selected?.id === m.id) setSelected(null);
    await load();
  }

  const list = messages.filter((m) => filter === 'all' || m.status === filter);
  const { page, setPage, totalPages, pageItems, pageSize } = useClientPager(list, 12, filter);

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Messages</h1>
          <p className="adm-muted">Contact form submissions from the storefront</p>
        </div>
      </div>
      <div className="adm-tabs" style={{ marginBottom: 14 }}>
        {['all', 'new', 'read', 'archived'].map((k) => (
          <button key={k} type="button" className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="adm-split">
        <div className="adm-panel adm-split__main">
          {loading ? (
            <p className="adm-muted">Loading…</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Topic</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((m) => (
                    <tr
                      key={m.id}
                      className={selected?.id === m.id ? 'adm-row--active' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelected(m);
                        if (m.status === 'new') setStatus(m, 'read').catch(console.error);
                      }}
                    >
                      <td>
                        <strong>{m.name}</strong>
                        <div className="adm-muted">{m.email}</div>
                      </td>
                      <td>{m.topic || '—'}</td>
                      <td>
                        <span className={`adm-badge ${m.status === 'new' ? 'adm-badge--pending' : m.status === 'archived' ? 'adm-badge--cancelled' : 'adm-badge--success'}`}>
                          {m.status}
                        </span>
                      </td>
                      <td>{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td colSpan={4} className="adm-muted">
                        No messages yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} totalPages={totalPages} onChange={setPage} total={list.length} pageSize={pageSize} />
        </div>
        <div className="adm-panel adm-split__side">
          {selected ? (
            <>
              <h2>{selected.name}</h2>
              <p className="adm-muted" style={{ marginTop: 0 }}>
                <a href={`mailto:${selected.email}`}>{selected.email}</a>
                {selected.topic ? ` · ${selected.topic}` : ''}
              </p>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selected.message}</p>
              <div className="adm-row-actions" style={{ marginTop: 16 }}>
                {selected.status !== 'read' && (
                  <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setStatus(selected, 'read')}>
                    Mark read
                  </button>
                )}
                {selected.status !== 'archived' && (
                  <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setStatus(selected, 'archived')}>
                    Archive
                  </button>
                )}
                <button type="button" className="adm-btn adm-btn--danger" onClick={() => remove(selected)}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="adm-muted">Select a message to read it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsAdmin() {
  const { token, session } = useApp();
  const [tab, setTab] = useState('seo');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [seo, setSeo] = useState({ title: '', description: '', keywords: '', og_image: '' });
  const [ga, setGa] = useState('');
  const [gtm, setGtm] = useState('');
  const [ads, setAds] = useState('');
  const [wa, setWa] = useState({ enabled: false, number: '', message: 'Hi Intimauae, I have a question.' });
  const [popup, setPopup] = useState({
    enabled: false,
    version: '1',
    delay_ms: 1200,
    title: 'Sign up for 10% off!',
    subtitle: 'Take 10% off your purchase. Use your coupon at checkout.',
    cta_text: 'Shop now',
    cta_url: '/catalogs',
    dismiss_label: 'No thanks',
    coupon_code: 'INTIMA15',
    image: ''
  });
  const [contactPage, setContactPage] = useState({
    hero_title: 'Contact Us',
    hero_subtitle: '',
    email: 'support@intimauae.ae',
    hours_title: 'Business hours',
    hours: 'Sunday–Thursday\n10:00–18:00 GST',
    payments_note: 'Secure checkout powered by Uniwebpay.'
  });
  const [faqs, setFaqs] = useState([{ q: '', a: '' }]);
  const [privacy, setPrivacy] = useState({ title: 'Privacy Policy', html: '' });
  const [shipping, setShipping] = useState({ title: 'Shipping Policy', html: '' });
  const [refund, setRefund] = useState({ title: 'Refund Policy', html: '' });
  const [about, setAbout] = useState({
    title: 'About Intimauae',
    subtitle: '',
    html: ''
  });
  const [banner, setBanner] = useState({
    enabled: true,
    text: 'Summer Sale | 15% OFF for All + Freebies | Code: INTIMA15',
    link: '/catalogs'
  });
  const [heroSlides, setHeroSlides] = useState([
    { image: '/hero/hero-daddy.jpg', title: 'Full Body Products', text: '', cta: 'Shop Full Body', to: '/full-body' },
    { image: '/hero/hero-cowgirl.jpg', title: 'Premium Intimauae Catalog', text: '', cta: 'Browse All', to: '/catalogs' }
  ]);
  const blankPay = { storeId: '', privateKey: '', framesPk: '', baseUrl: '', notifyUrl: '', keyVersion: '', rate: '' };
  const [payForm, setPayForm] = useState(blankPay);
  const [payConfigured, setPayConfigured] = useState({
    storeId: false,
    privateKey: false,
    framesPk: false,
    baseUrl: false,
    notifyUrl: false,
    keyVersion: '1',
    rate: 1.35
  });
  const [paySaving, setPaySaving] = useState(false);

  const tabs = [
    ['seo', 'SEO'],
    ['google', 'Google tags'],
    ['whatsapp', 'WhatsApp'],
    ['popup', 'Site popup'],
    ['banners', 'Banners'],
    ['about', 'About us'],
    ['contact', 'Contact page'],
    ['faqs', 'FAQs'],
    ['policies', 'Policies'],
    ['payments', 'Payments'],
    ['password', 'Password']
  ];

  async function loadPaymentFlags() {
    const d = await api('/api/admin/payments/config', { token });
    setPayConfigured(d.configured || {});
  }

  useEffect(() => {
    api('/api/admin/settings', { token }).then((d) => {
      const map = Object.fromEntries((d.settings || []).map((s) => [s.key, s.value]));
      if (map.site_seo) setSeo({ title: '', description: '', keywords: '', og_image: '', ...map.site_seo });
      if (map.google_analytics_id != null) setGa(String(map.google_analytics_id).replace(/"/g, ''));
      if (map.google_tag_manager_id != null) setGtm(String(map.google_tag_manager_id).replace(/"/g, ''));
      if (map.google_ads_id != null) setAds(String(map.google_ads_id).replace(/"/g, ''));
      if (map.whatsapp) setWa((w) => ({ ...w, ...map.whatsapp }));
      if (map.site_popup) setPopup((p) => ({ ...p, ...map.site_popup }));
      if (map.page_contact) setContactPage((c) => ({ ...c, ...map.page_contact }));
      if (map.page_faqs?.items) setFaqs(map.page_faqs.items.length ? map.page_faqs.items : [{ q: '', a: '' }]);
      if (map.page_privacy_policy) setPrivacy((p) => ({ ...p, ...map.page_privacy_policy }));
      if (map.page_shipping_policy) setShipping((p) => ({ ...p, ...map.page_shipping_policy }));
      if (map.page_refund_policy) setRefund((p) => ({ ...p, ...map.page_refund_policy }));
      if (map.page_about) setAbout((a) => ({ ...a, ...map.page_about }));
      if (map.site_banner) setBanner((b) => ({ ...b, ...map.site_banner }));
      if (Array.isArray(map.hero_slides) && map.hero_slides.length) setHeroSlides(map.hero_slides);
    });
    loadPaymentFlags().catch(console.error);
  }, [token]);

  async function putSetting(key, value) {
    await api(`/api/admin/settings/${key}`, { method: 'PUT', token, body: { value } });
  }

  async function saveSeo() {
    await putSetting('site_seo', seo);
    setMsg('Site SEO saved.');
  }

  async function saveGoogle() {
    await putSetting('google_analytics_id', ga.trim());
    await putSetting('google_tag_manager_id', gtm.trim());
    await putSetting('google_ads_id', ads.trim());
    setMsg('Google tags saved.');
  }

  async function saveWhatsapp() {
    await putSetting('whatsapp', wa);
    setMsg('WhatsApp widget settings saved.');
  }

  async function savePopup() {
    await putSetting('site_popup', { ...popup, version: String(popup.version || '1') });
    setMsg('Popup settings saved. Coupon codes are managed under Discounts.');
  }

  async function saveContactPage() {
    await putSetting('page_contact', contactPage);
    setMsg('Contact page details saved.');
  }

  async function saveFaqs() {
    const items = faqs.filter((f) => String(f.q || '').trim() || String(f.a || '').trim());
    await putSetting('page_faqs', { items });
    setMsg('FAQs saved.');
  }

  async function savePolicies() {
    await putSetting('page_privacy_policy', privacy);
    await putSetting('page_shipping_policy', shipping);
    await putSetting('page_refund_policy', refund);
    setMsg('Policies saved.');
  }

  async function saveAbout() {
    await putSetting('page_about', about);
    setMsg('About us page saved.');
  }

  async function saveBanners() {
    await putSetting('site_banner', banner);
    await putSetting(
      'hero_slides',
      heroSlides.filter((s) => s.image || s.title)
    );
    setMsg('Banners saved. Refresh the storefront to see changes.');
  }

  async function savePayments(e) {
    e.preventDefault();
    setPaySaving(true);
    setMsg('');
    try {
      const res = await api('/api/admin/payments/config', { method: 'PUT', token, body: { ...payForm } });
      setPayForm(blankPay);
      if (res.configured) setPayConfigured(res.configured);
      setMsg(res.message || (res.saved ? 'Payment settings updated.' : 'Nothing saved — leave blank to keep existing keys.'));
    } catch (err) {
      setMsg(err.message || 'Failed to save payment settings.');
    } finally {
      setPaySaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg('');
    if (password.length < 8) return setPwMsg('Password must be at least 8 characters.');
    if (password !== confirm) return setPwMsg('Passwords do not match.');
    if (!supabase) return setPwMsg('Supabase not configured.');
    const { error } = await supabase.auth.updateUser({ password });
    setPwMsg(error ? error.message : 'Admin password updated.');
    if (!error) {
      setPassword('');
      setConfirm('');
    }
  }

  function SecretField({ label, field, hint, multiline, secret = true }) {
    const configured = !!payConfigured[field];
    return (
      <label className={multiline ? 'adm-span-2' : undefined}>
        <span className="adm-secret-label">
          {label}
          <span className={`adm-badge ${configured ? 'adm-badge--success' : 'adm-badge--cancelled'}`}>
            {configured ? 'Saved' : 'Not set'}
          </span>
        </span>
        {multiline ? (
          <textarea
            rows={4}
            value={payForm[field]}
            onChange={(e) => setPayForm({ ...payForm, [field]: e.target.value })}
            placeholder={configured ? 'Leave blank to keep the existing key' : 'Paste new key…'}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <input
            type={secret ? 'password' : 'text'}
            value={payForm[field]}
            onChange={(e) => setPayForm({ ...payForm, [field]: e.target.value })}
            placeholder={configured ? 'Leave blank to keep existing' : 'Enter value…'}
            autoComplete="off"
          />
        )}
        {hint && <span className="adm-field-hint">{hint}</span>}
      </label>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-head">
        <div>
          <h1>Settings</h1>
          <p className="adm-muted">Signed in as {session?.user?.email}</p>
        </div>
      </div>
      <div className="adm-tabs" style={{ marginBottom: 16 }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMsg(''); }}>
            {label}
          </button>
        ))}
      </div>
      {msg && <p className="adm-msg" style={{ marginBottom: 14 }}>{msg}</p>}

      {tab === 'seo' && (
        <section className="adm-panel adm-form">
          <h2>Site SEO</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>Default title and meta tags for the storefront.</p>
          <div className="adm-form-grid">
            <label className="adm-span-2">
              Site title
              <input value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} />
            </label>
            <label className="adm-span-2">
              Meta description
              <textarea rows={3} value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} />
            </label>
            <label className="adm-span-2">
              Keywords
              <input value={seo.keywords} onChange={(e) => setSeo({ ...seo, keywords: e.target.value })} />
            </label>
          </div>
          <label>
            OG image
            <ImageField single urls={seo.og_image ? [seo.og_image] : []} onChange={(urls) => setSeo({ ...seo, og_image: urls[0] || '' })} token={token} />
          </label>
          <button className="adm-btn adm-btn--primary" type="button" onClick={saveSeo}>
            Save SEO
          </button>
        </section>
      )}

      {tab === 'google' && (
        <section className="adm-panel adm-form">
          <h2>Google tags</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>Paste IDs only — scripts inject on the live site.</p>
          <div className="adm-form-grid">
            <label>
              Google Analytics (G-…)
              <input value={ga} onChange={(e) => setGa(e.target.value)} placeholder="G-XXXXXXXX" />
            </label>
            <label>
              Google Tag Manager (GTM-…)
              <input value={gtm} onChange={(e) => setGtm(e.target.value)} placeholder="GTM-XXXXXXX" />
            </label>
            <label>
              Google Ads (AW-…)
              <input value={ads} onChange={(e) => setAds(e.target.value)} placeholder="AW-XXXXXXXX" />
            </label>
          </div>
          <button className="adm-btn adm-btn--primary" type="button" onClick={saveGoogle}>
            Save Google tags
          </button>
        </section>
      )}

      {tab === 'whatsapp' && (
        <section className="adm-panel adm-form">
          <h2>WhatsApp widget</h2>
          <label className="adm-check" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={!!wa.enabled} onChange={(e) => setWa({ ...wa, enabled: e.target.checked })} /> Show floating WhatsApp button
          </label>
          <div className="adm-form-grid">
            <label>
              Number (with country code)
              <input value={wa.number} onChange={(e) => setWa({ ...wa, number: e.target.value })} placeholder="9715XXXXXXXX" />
            </label>
            <label>
              Prefill message
              <input value={wa.message} onChange={(e) => setWa({ ...wa, message: e.target.value })} />
            </label>
          </div>
          <button className="adm-btn adm-btn--primary" type="button" onClick={saveWhatsapp}>
            Save WhatsApp
          </button>
        </section>
      )}

      {tab === 'popup' && (
        <section className="adm-panel adm-form">
          <h2>Site popup</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>
            Promo overlay on the storefront. Coupon codes themselves are edited under Discounts.
          </p>
          <label className="adm-check" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={!!popup.enabled} onChange={(e) => setPopup({ ...popup, enabled: e.target.checked })} /> Enable popup
          </label>
          <div className="adm-form-grid">
            <label>
              Title
              <input value={popup.title} onChange={(e) => setPopup({ ...popup, title: e.target.value })} />
            </label>
            <label>
              Coupon code shown
              <input value={popup.coupon_code} onChange={(e) => setPopup({ ...popup, coupon_code: e.target.value })} placeholder="INTIMA15" />
            </label>
            <label className="adm-span-2">
              Subtitle
              <input value={popup.subtitle} onChange={(e) => setPopup({ ...popup, subtitle: e.target.value })} />
            </label>
            <label>
              Button text
              <input value={popup.cta_text} onChange={(e) => setPopup({ ...popup, cta_text: e.target.value })} />
            </label>
            <label>
              Button link
              <input value={popup.cta_url} onChange={(e) => setPopup({ ...popup, cta_url: e.target.value })} />
            </label>
            <label>
              Dismiss label
              <input value={popup.dismiss_label} onChange={(e) => setPopup({ ...popup, dismiss_label: e.target.value })} />
            </label>
            <label>
              Version (bump to show again)
              <input value={popup.version} onChange={(e) => setPopup({ ...popup, version: e.target.value })} />
            </label>
          </div>
          <label>
            Popup image
            <ImageField single urls={popup.image ? [popup.image] : []} onChange={(urls) => setPopup({ ...popup, image: urls[0] || '' })} token={token} />
          </label>
          <button className="adm-btn adm-btn--primary" type="button" onClick={savePopup}>
            Save popup
          </button>
        </section>
      )}

      {tab === 'banners' && (
        <section className="adm-panel adm-form">
          <h2>Banners</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>
            Edit the pink top announcement bar and homepage hero slides.
          </p>
          <h3 style={{ marginBottom: 8 }}>Top announcement bar</h3>
          <label className="adm-check" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={banner.enabled !== false} onChange={(e) => setBanner({ ...banner, enabled: e.target.checked })} /> Show announcement bar
          </label>
          <div className="adm-form-grid">
            <label className="adm-span-2">
              Banner text
              <input value={banner.text} onChange={(e) => setBanner({ ...banner, text: e.target.value })} />
            </label>
            <label className="adm-span-2">
              Link (optional)
              <input value={banner.link || ''} onChange={(e) => setBanner({ ...banner, link: e.target.value })} placeholder="/catalogs" />
            </label>
          </div>

          <h3 style={{ marginTop: 22, marginBottom: 8 }}>Homepage hero slides</h3>
          <div className="adm-faq-list">
            {heroSlides.map((slide, i) => (
              <div key={i} className="adm-faq-item">
                <div className="adm-faq-item__head">
                  <strong>Slide #{i + 1}</strong>
                  <button type="button" className="adm-btn adm-btn--danger" onClick={() => setHeroSlides(heroSlides.filter((_, idx) => idx !== i))}>
                    Remove
                  </button>
                </div>
                <label>
                  Image
                  <ImageField
                    single
                    urls={slide.image ? [slide.image] : []}
                    onChange={(urls) => {
                      const next = [...heroSlides];
                      next[i] = { ...next[i], image: urls[0] || '' };
                      setHeroSlides(next);
                    }}
                    token={token}
                  />
                </label>
                <div className="adm-form-grid">
                  <label>
                    Title
                    <input
                      value={slide.title || ''}
                      onChange={(e) => {
                        const next = [...heroSlides];
                        next[i] = { ...next[i], title: e.target.value };
                        setHeroSlides(next);
                      }}
                    />
                  </label>
                  <label>
                    Button link
                    <input
                      value={slide.to || ''}
                      onChange={(e) => {
                        const next = [...heroSlides];
                        next[i] = { ...next[i], to: e.target.value };
                        setHeroSlides(next);
                      }}
                      placeholder="/full-body"
                    />
                  </label>
                  <label className="adm-span-2">
                    Caption (optional)
                    <input
                      value={slide.text || ''}
                      onChange={(e) => {
                        const next = [...heroSlides];
                        next[i] = { ...next[i], text: e.target.value };
                        setHeroSlides(next);
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="adm-row-actions">
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => setHeroSlides([...heroSlides, { image: '', title: '', text: '', cta: 'Shop', to: '/catalogs' }])}
            >
              Add slide
            </button>
            <button type="button" className="adm-btn adm-btn--primary" onClick={saveBanners}>
              Save banners
            </button>
          </div>
        </section>
      )}

      {tab === 'about' && (
        <section className="adm-panel adm-form">
          <h2>About us</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>
            Content shown on /about. Saved to the database settings table.
          </p>
          <label>
            Page title
            <input value={about.title} onChange={(e) => setAbout({ ...about, title: e.target.value })} />
          </label>
          <label>
            Subtitle
            <textarea
              rows={2}
              value={about.subtitle}
              onChange={(e) => setAbout({ ...about, subtitle: e.target.value })}
            />
          </label>
          <label>
            Page content
            <RichEditor value={about.html} onChange={(html) => setAbout({ ...about, html })} />
          </label>
          <button className="adm-btn adm-btn--primary" type="button" onClick={saveAbout}>
            Save about us
          </button>
        </section>
      )}

      {tab === 'contact' && (
        <section className="adm-panel adm-form">
          <h2>Contact page</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>
            Details shown beside the contact form. Form submissions appear under Messages.
          </p>
          <div className="adm-form-grid">
            <label className="adm-span-2">
              Hero title
              <input value={contactPage.hero_title} onChange={(e) => setContactPage({ ...contactPage, hero_title: e.target.value })} />
            </label>
            <label className="adm-span-2">
              Hero subtitle
              <textarea rows={2} value={contactPage.hero_subtitle} onChange={(e) => setContactPage({ ...contactPage, hero_subtitle: e.target.value })} />
            </label>
            <label>
              Support email
              <input type="email" value={contactPage.email} onChange={(e) => setContactPage({ ...contactPage, email: e.target.value })} />
            </label>
            <label>
              Hours title
              <input value={contactPage.hours_title} onChange={(e) => setContactPage({ ...contactPage, hours_title: e.target.value })} />
            </label>
            <label className="adm-span-2">
              Business hours
              <textarea rows={3} value={contactPage.hours} onChange={(e) => setContactPage({ ...contactPage, hours: e.target.value })} />
            </label>
            <label className="adm-span-2">
              Payments note
              <input value={contactPage.payments_note} onChange={(e) => setContactPage({ ...contactPage, payments_note: e.target.value })} />
            </label>
          </div>
          <button className="adm-btn adm-btn--primary" type="button" onClick={saveContactPage}>
            Save contact page
          </button>
        </section>
      )}

      {tab === 'faqs' && (
        <section className="adm-panel adm-form">
          <h2>FAQs</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>Add, edit, or remove questions shown on /faqs.</p>
          <div className="adm-faq-list">
            {faqs.map((item, i) => (
              <div key={i} className="adm-faq-item">
                <div className="adm-faq-item__head">
                  <strong>#{i + 1}</strong>
                  <button
                    type="button"
                    className="adm-btn adm-btn--danger"
                    onClick={() => setFaqs(faqs.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                </div>
                <label>
                  Question
                  <input
                    value={item.q}
                    onChange={(e) => {
                      const next = [...faqs];
                      next[i] = { ...next[i], q: e.target.value };
                      setFaqs(next);
                    }}
                  />
                </label>
                <label>
                  Answer
                  <textarea
                    rows={3}
                    value={item.a}
                    onChange={(e) => {
                      const next = [...faqs];
                      next[i] = { ...next[i], a: e.target.value };
                      setFaqs(next);
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="adm-row-actions">
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setFaqs([...faqs, { q: '', a: '' }])}>
              Add FAQ
            </button>
            <button type="button" className="adm-btn adm-btn--primary" onClick={saveFaqs}>
              Save FAQs
            </button>
          </div>
        </section>
      )}

      {tab === 'policies' && (
        <section className="adm-panel adm-form">
          <h2>Policies</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>Edit privacy, shipping, and refund policy pages.</p>
          <label>
            Privacy policy title
            <input value={privacy.title} onChange={(e) => setPrivacy({ ...privacy, title: e.target.value })} />
          </label>
          <label>
            Privacy policy content
            <RichEditor value={privacy.html} onChange={(html) => setPrivacy({ ...privacy, html })} />
          </label>
          <label>
            Shipping policy title
            <input value={shipping.title} onChange={(e) => setShipping({ ...shipping, title: e.target.value })} />
          </label>
          <label>
            Shipping policy content
            <RichEditor value={shipping.html} onChange={(html) => setShipping({ ...shipping, html })} />
          </label>
          <label>
            Refund policy title
            <input value={refund.title} onChange={(e) => setRefund({ ...refund, title: e.target.value })} />
          </label>
          <label>
            Refund policy content
            <RichEditor value={refund.html} onChange={(html) => setRefund({ ...refund, html })} />
          </label>
          <button className="adm-btn adm-btn--primary" type="button" onClick={savePolicies}>
            Save policies
          </button>
        </section>
      )}

      {tab === 'payments' && (
        <form className="adm-panel adm-form" onSubmit={savePayments}>
          <h2>Payment APIs</h2>
          <p className="adm-muted" style={{ marginTop: 0 }}>
            Secrets are never shown here. Fields stay blank — only enter a value when you want to replace it.
            Leaving a field empty keeps whatever is already saved. The Uniwebpay RSA <strong>public</strong> key is
            registered on Uniwebpay’s side only — our database stores the matching <strong>private</strong> key.
          </p>
          <div className="adm-panel" style={{ marginBottom: 16, padding: 12, background: 'rgba(0,0,0,0.03)' }}>
            <div className="adm-muted" style={{ marginBottom: 6 }}>
              Loaded config check (safe — no secrets)
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div>
                Store ID: <code>{payConfigured.storeIdValue || '—'}</code>
              </div>
              <div>
                Key version: <code>{payConfigured.keyVersionValue || '1'}</code>
              </div>
              <div>
                Private key:{' '}
                {payConfigured.privateKeyOk ? (
                  <span>
                    valid RSA{payConfigured.privateKeyBits ? ` ${payConfigured.privateKeyBits}-bit` : ''} · fingerprint{' '}
                    <code>{payConfigured.privateKeyFingerprint}</code>
                  </span>
                ) : payConfigured.privateKey ? (
                  <span style={{ color: '#b00020' }}>invalid — {payConfigured.privateKeyError || 'cannot parse'}</span>
                ) : (
                  <span>not set</span>
                )}
              </div>
              <div>
                Frames pk: {payConfigured.framesPk ? <code>{payConfigured.framesPkPrefix}…</code> : 'not set'}
              </div>
              <div>
                Notify URL: <code>{payConfigured.notifyUrlValue || '—'}</code>
              </div>
            </div>
          </div>
          <div className="adm-form-grid">
            <SecretField label="Uniwebpay store ID" field="storeId" secret={false} />
            <SecretField label="Key version" field="keyVersion" secret={false} hint={`Current: ${payConfigured.keyVersionValue || '1'}`} />
            <SecretField label="Private key (PKCS8)" field="privateKey" multiline />
            <SecretField label="Checkout Frames public key" field="framesPk" />
            <SecretField label="API base URL" field="baseUrl" secret={false} />
            <SecretField label="Notify / webhook URL" field="notifyUrl" secret={false} />
            <label>
              <span className="adm-secret-label">
                USD → SGD rate
                <span className="adm-badge adm-badge--pending">Catalog is SGD — leave blank / use 1</span>
              </span>
              <input
                value={payForm.rate}
                onChange={(e) => setPayForm({ ...payForm, rate: e.target.value })}
                placeholder="1 (prices are already SGD)"
                inputMode="decimal"
                autoComplete="off"
              />
            </label>
          </div>
          <div className="adm-row-actions" style={{ marginTop: 8 }}>
            <button className="adm-btn adm-btn--primary" type="submit" disabled={paySaving}>
              {paySaving ? 'Saving…' : 'Save payment settings'}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => {
                setPayForm(blankPay);
                loadPaymentFlags().catch(console.error);
              }}
            >
              Clear form
            </button>
          </div>
        </form>
      )}

      {tab === 'password' && (
        <form className="adm-panel adm-form" onSubmit={changePassword}>
          <h2>Change admin password</h2>
          <label>
            New password
            <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Confirm password
            <input type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <button className="adm-btn adm-btn--primary" type="submit">
            Update password
          </button>
          {pwMsg && <p className="adm-msg">{pwMsg}</p>}
        </form>
      )}
    </div>
  );
}

export default function AdminRoutes() {
  return (
    <RequireAdmin>
      <Routes>
        <Route path="/*" element={<AdminShell />}>
          <Route index element={<Dash />} />
          <Route path="products" element={<ProductsList />} />
          <Route path="products/new" element={<ProductEditor />} />
          <Route path="products/:id" element={<ProductEditor />} />
          <Route path="orders" element={<OrdersAdmin />} />
          <Route path="customers" element={<CustomersAdmin />} />
          <Route path="messages" element={<MessagesAdmin />} />
          <Route path="audits" element={<AuditAdmin />} />
          <Route path="discounts" element={<DiscountsAdmin />} />
          <Route path="warehouses" element={<WarehousesAdmin />} />
          <Route path="blog" element={<BlogList />} />
          <Route path="blog/new" element={<BlogEditor />} />
          <Route path="blog/:handle" element={<BlogEditor />} />
          <Route path="settings" element={<SettingsAdmin />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </RequireAdmin>
  );
}
