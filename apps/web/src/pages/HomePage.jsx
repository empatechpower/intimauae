import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard';
import { HERO_SLIDES, media } from '../lib/media';
import { useApp } from '../context/AppContext';
import { t, formatBlogDate } from '../lib/i18n';
import { usePublicSettings } from '../components/SiteIntegrations';

export default function HomePage() {
  const { lang } = useApp();
  const settings = usePublicSettings();
  const [products, setProducts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [index, setIndex] = useState(0);

  const slides = useMemo(() => {
    const raw = Array.isArray(settings.hero_slides) && settings.hero_slides.length ? settings.hero_slides : HERO_SLIDES;
    return raw.map((s) => ({
      src: s.image || s.src,
      title: s.title || '',
      text: s.text || '',
      cta: s.cta || 'Shop',
      to: s.to || '/catalogs'
    }));
  }, [settings.hero_slides]);

  useEffect(() => {
    api('/api/catalog/products')
      .then((d) => setProducts(d.products || []))
      .catch(console.error);
    api('/api/blog')
      .then((d) => setPosts((d.posts || []).slice(0, 3)))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!slides.length) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5500);
    return () => clearInterval(id);
  }, [slides.length]);

  const full = products.filter((p) => p.category_id === 'full-body' || p.category === 'Full Body Products');
  const partial = products.filter((p) => p.category_id === 'partial-body' || p.category === 'Partial Body Products');
  const trunk = products.filter((p) => p.category_id === 'trunk' || p.category === 'Trunk');
  const safeIndex = slides.length ? index % slides.length : 0;

  return (
    <main>
      <section className="hero" id="hero">
        <div className="hero-track" style={{ transform: `translateX(${-safeIndex * 100}%)` }}>
          {slides.map((s) => (
            <div className="hero-slide" key={`${s.src}-${s.title}`}>
              <Link to={s.to} className="hero-slide-link" aria-label={s.title}>
                <img src={media(s.src)} alt={s.title} />
              </Link>
            </div>
          ))}
        </div>
        {slides.length > 1 && (
          <>
            <div className="hero-nav">
              <button type="button" aria-label="Previous" onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}>
                ‹
              </button>
              <button type="button" aria-label="Next" onClick={() => setIndex((i) => (i + 1) % slides.length)}>
                ›
              </button>
            </div>
            <div className="hero-dots">
              {slides.map((_, i) => (
                <button key={i} type="button" className={i === safeIndex ? 'on' : ''} aria-label={`Go to slide ${i + 1}`} onClick={() => setIndex(i)} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">{lang === 'ar' ? 'من Intimauae' : 'From Intimauae.ae'}</div>
            <h2>{lang === 'ar' ? 'تسوق حسب الفئة' : 'Shop by Category'}</h2>
            <p>{lang === 'ar' ? 'الجسم الكامل · الجسم الجزئي · الجذع' : 'Full Body, Partial Body, and Trunk.'}</p>
          </div>
          <div className="cat-grid">
            <Link className="cat-card" to="/full-body">
              <img src="/categories/full-body.jpg" alt="Full Body" />
              <span>{lang === 'ar' ? 'جسم كامل' : 'Full Body'}</span>
            </Link>
            <Link className="cat-card" to="/partial-body">
              <img src="/categories/partial-body.jpg" alt="Partial Body" />
              <span>{lang === 'ar' ? 'جسم جزئي' : 'Partial Body'}</span>
            </Link>
            <Link className="cat-card" to="/trunk">
              <img src="/categories/trunk.jpg" alt="Trunk" />
              <span>{lang === 'ar' ? 'الجذع' : 'Trunk'}</span>
            </Link>
          </div>
        </div>
      </section>

      <Section eyebrow={lang === 'ar' ? 'الجسم الكامل' : 'Whole Body'} title={t(lang, 'fullBody')} to="/full-body" items={full} lang={lang} />
      <Section eyebrow={lang === 'ar' ? 'أجزاء' : 'Local Part'} title={t(lang, 'partialBody')} to="/partial-body" items={partial} lang={lang} />
      <Section eyebrow={lang === 'ar' ? 'الجذع' : 'Torso & Trunk'} title={t(lang, 'trunk')} to="/trunk" items={trunk} lang={lang} />

      <section className="section blog-home">
        <div className="wrap">
          <div className="blog-home__head">
            <div className="blog-home__titles">
              <div className="eyebrow">{lang === 'ar' ? 'المدونة' : 'Journal'}</div>
              <h2>{t(lang, 'blogPosts')}</h2>
            </div>
            <Link className="view-all" to="/blogs">
              {t(lang, 'viewAll')}
            </Link>
          </div>
          <div className="blog-grid">
            {posts.map((p) => (
              <Link key={p.handle} to={`/blogs/${p.handle}`} className="blog-card">
                <div className="blog-card__media">
                  <img src={media(p.image)} alt="" loading="lazy" />
                </div>
                <div className="blog-card__body">
                  <div className="blog-card__date">{p.dateLabel || formatBlogDate(p.published_at, lang)}</div>
                  <h3>{p.title}</h3>
                </div>
              </Link>
            ))}
            {!posts.length && (
              <p style={{ color: '#9aa6b2' }}>{lang === 'ar' ? 'لا توجد مقالات بعد.' : 'No blog posts yet.'}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Section({ eyebrow, title, to, items, lang }) {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
        <div className="product-grid">
          {items.map((p) => (
            <ProductCard key={p.id || p.handle} product={p} />
          ))}
        </div>
        <div className="center">
          <Link className="view-all" to={to}>
            {t(lang, 'viewAll')} {title}
          </Link>
        </div>
      </div>
    </section>
  );
}
