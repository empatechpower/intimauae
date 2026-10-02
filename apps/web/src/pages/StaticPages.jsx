import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { t, formatBlogDate } from '../lib/i18n';
import { media } from '../lib/media';
import { usePublicSettings } from '../components/SiteIntegrations';

export function AboutPage() {
  const { lang } = useApp();
  const settings = usePublicSettings();
  const about = settings.page_about || {};
  const title = about.title || 'About Intimauae';
  const subtitle =
    about.subtitle ||
    'Premium Full Body, Partial Body, and Trunk companions crafted for lifelike presence — with discreet packaging and private delivery across the UAE and worldwide.';
  const html = about.html || '';

  return (
    <main>
      <section className="page-hero">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </section>
      <div className="wrap" style={{ padding: '20px 0 40px' }}>
        {html ? (
          <div className="about-body" style={{ color: '#9aa6b2', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: html }} />
        ) : null}
        <div className="cta-row">
          <Link className="btn-pink" to="/catalogs">
            {t(lang, 'shopCollection')}
          </Link>
          <Link className="btn-ghost" to="/contact">
            {t(lang, 'contact')}
          </Link>
        </div>
      </div>
    </main>
  );
}

export function ContactPage() {
  const { lang } = useApp();
  const settings = usePublicSettings();
  const contact = settings.page_contact || {};
  const [form, setForm] = useState({ name: '', email: '', topic: 'Product guidance', message: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      await api('/api/contact', { method: 'POST', body: form });
      setForm({ name: '', email: '', topic: 'Product guidance', message: '' });
      setStatus(lang === 'ar' ? 'تم إرسال رسالتك. سنرد قريباً.' : 'Message sent. We’ll get back to you soon.');
    } catch (err) {
      setStatus(err.message || 'Failed to send message.');
    } finally {
      setBusy(false);
    }
  }

  const email = contact.email || 'support@intimauae.ae';
  const hours = (contact.hours || 'Sunday–Thursday\n10:00–18:00 GST').split('\n');

  return (
    <main>
      <section className="page-hero">
        <h1>{contact.hero_title || (lang === 'ar' ? 'اتصل بنا' : 'Contact Us')}</h1>
        <p>
          {contact.hero_subtitle ||
            (lang === 'ar'
              ? 'أسئلة عن المواد أو المقاسات أو الشحن السري؟ راسلنا بخصوصية.'
              : 'Questions about materials, sizing, or discreet shipping? Send a message — we reply privately.')}
        </p>
      </section>
      <div className="wrap contact-layout">
        <div className="panel">
          <form onSubmit={onSubmit}>
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
            <label>Email</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
            <label>Topic</label>
            <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
              <option>Product guidance</option>
              <option>Order status</option>
              <option>Shipping & packaging</option>
              <option>Returns</option>
              <option>Other</option>
            </select>
            <label>Message</label>
            <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" />
            <button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
            {status && <p className="muted" style={{ marginTop: 12 }}>{status}</p>}
          </form>
        </div>
        <div className="panel">
          <div className="info">
            <h3>Email support</h3>
            <p>
              <a href={`mailto:${email}`}>{email}</a>
            </p>
          </div>
          <div className="info">
            <h3>{contact.hours_title || 'Business hours'}</h3>
            <p>
              {hours.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < hours.length - 1 ? <br /> : null}
                </span>
              ))}
            </p>
          </div>
          <div className="info">
            <h3>Payments</h3>
            <p>{contact.payments_note || 'Secure checkout powered by Uniwebpay.'}</p>
          </div>
          <div className="info">
            <h3>Policies</h3>
            <p>
              <Link to="/policies/shipping-policy">Shipping Policy</Link>
              <br />
              <Link to="/policies/refund-policy">Refund Policy</Link>
              <br />
              <Link to="/policies/privacy-policy">Privacy Policy</Link>
              <br />
              <Link to="/faqs">FAQs</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export function FaqsPage() {
  const settings = usePublicSettings();
  const items = settings.page_faqs?.items || [];

  return (
    <main className="wrap" style={{ maxWidth: 900, padding: '40px 16px 60px' }}>
      <div className="page-hero" style={{ background: 'transparent', padding: '20px 0 28px' }}>
        <h1>FAQs</h1>
      </div>
      {items.map((item, i) => (
        <details
          key={`${item.q}-${i}`}
          open={i === 0}
          style={{ background: '#131e2b', padding: 14, marginBottom: 10, border: '1px solid rgba(255,255,255,.08)' }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{item.q}</summary>
          <p className="muted" style={{ color: '#9aa6b2', marginTop: 10, whiteSpace: 'pre-wrap' }}>
            {item.a}
          </p>
        </details>
      ))}
      {!items.length && <p style={{ color: '#9aa6b2' }}>No FAQs yet.</p>}
    </main>
  );
}

export function BlogListPage() {
  const { lang } = useApp();
  const [posts, setPosts] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/blog')
      .then((d) => setPosts(d.posts || []))
      .catch((e) => setErr(e.message || 'Failed to load blog'));
  }, []);
  return (
    <main className="wrap" style={{ padding: '40px 0 60px' }}>
      <div className="blog-home__head" style={{ marginBottom: 22 }}>
        <div className="blog-home__titles">
          <div className="eyebrow">Journal</div>
          <h2>Blog posts</h2>
        </div>
      </div>
      {err && <p style={{ color: '#ff6b9d' }}>{err}</p>}
      {!err && !posts.length && <p style={{ color: '#9aa6b2' }}>No posts yet.</p>}
      <div className="blog-grid">
        {posts.map((p) => (
          <Link key={p.handle} to={`/blogs/${p.handle}`} className="blog-card">
            <div className="blog-card__media">
              <img src={media(p.image)} alt="" />
            </div>
            <div className="blog-card__body">
              <div className="blog-card__date">{p.dateLabel || formatBlogDate(p.published_at, lang)}</div>
              <h3>{p.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function BlogPostPage() {
  const { handle } = useParams();
  const [post, setPost] = useState(null);
  useEffect(() => {
    api(`/api/blog/${handle}`)
      .then((d) => setPost(d.post))
      .catch(() => setPost(null));
  }, [handle]);
  if (!post) return <main className="wrap" style={{ padding: 40 }}>Loading…</main>;
  const raw = post.body;
  const html =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((p) => (String(p).includes('<') ? String(p) : `<p>${String(p)}</p>`)).join('')
        : '';
  return (
    <main className="wrap" style={{ maxWidth: 780, padding: '28px 0 60px' }}>
      <Link to="/blogs" style={{ color: '#9aa6b2' }}>
        ← Blog
      </Link>
      <div style={{ aspectRatio: '16/9', overflow: 'hidden', background: '#131e2b', margin: '16px 0' }}>
        <img src={media(post.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <p style={{ color: '#9aa6b2' }}>{post.dateLabel || formatBlogDate(post.published_at)}</p>
      <h1 style={{ fontFamily: 'Poppins,sans-serif' }}>{post.title}</h1>
      <div className="blog-body" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

export function PolicyPage({ settingKey, fallbackTitle }) {
  const settings = usePublicSettings();
  const page = settings[settingKey] || {};
  const title = page.title || fallbackTitle;
  const html = page.html || '<p>Content coming soon.</p>';
  return (
    <main className="wrap" style={{ maxWidth: 820, padding: '40px 0 60px' }}>
      <h1 style={{ fontFamily: 'Poppins,sans-serif' }}>{title}</h1>
      <div className="policy-body" style={{ color: '#9aa6b2', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
