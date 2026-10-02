import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { t } from '../lib/i18n';
import { media } from '../lib/media';
import { usePublicSettings } from './SiteIntegrations';

function IconAccount() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 19.2c1.6-3.1 4-4.7 7-4.7s5.4 1.6 7 4.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16.2 16.2L20.5 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconBag() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 8.5h10l-.7 10.1a1.4 1.4 0 0 1-1.4 1.3H9.1a1.4 1.4 0 0 1-1.4-1.3L7 8.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.2 8.5V7.3A2.8 2.8 0 0 1 12 4.5a2.8 2.8 0 0 1 2.8 2.8v1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  { to: '/', labelKey: 'home', end: true },
  {
    to: '/catalogs',
    labelKey: 'catalogs',
    children: [
      { to: '/catalogs', label: 'All Products' },
      { to: '/full-body', labelKey: 'fullBody' },
      { to: '/partial-body', labelKey: 'partialBody' },
      { to: '/trunk', labelKey: 'trunk' }
    ]
  },
  { to: '/full-body', labelKey: 'fullBody' },
  { to: '/partial-body', labelKey: 'partialBody' },
  { to: '/trunk', labelKey: 'trunk' },
  { to: '/about', labelKey: 'about' },
  { to: '/contact', labelKey: 'contact' }
];

export default function SiteHeader() {
  const { lang, cartCount, session, openCart, isAdmin } = useApp();
  const settings = usePublicSettings();
  const banner = settings.site_banner || {};
  const [drawer, setDrawer] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    if (drawer) document.body.style.overflow = 'hidden';
    else if (!document.querySelector('.cart-drawer.is-open')) document.body.style.overflow = '';
    return () => {
      if (!document.querySelector('.cart-drawer.is-open')) document.body.style.overflow = '';
    };
  }, [drawer]);

  function submitSearch(e) {
    e.preventDefault();
    setSearchOpen(false);
    setDrawer(false);
    nav(`/catalogs?q=${encodeURIComponent(q.trim())}`);
  }

  function closeDrawer() {
    setDrawer(false);
    setCatalogOpen(false);
  }

  return (
    <>
      {banner.enabled !== false && (banner.text || t(lang, 'saleBanner')) && (
        <div className="announce">
          {banner.link ? (
            <Link to={banner.link} style={{ color: 'inherit', textDecoration: 'none' }}>
              {banner.text || t(lang, 'saleBanner')}
            </Link>
          ) : (
            banner.text || t(lang, 'saleBanner')
          )}
        </div>
      )}

      <header className="iae-header" id="SiteHeader">
        <div className="iae-header-inner">
          <Link to="/" className="iae-logo" onClick={closeDrawer}>
            <img src={media('logo-pink.png')} alt="Intimauae" />
          </Link>

          <ul id="SiteNav" className="iae-nav iae-nav--desktop">
            {NAV.map((item) =>
              item.children ? (
                <li key={item.to} className="has-dd">
                  <NavLink to={item.to}>
                    <span>{t(lang, item.labelKey)}</span>
                    <svg width="10" height="10" viewBox="0 0 28 16" aria-hidden="true">
                      <path d="M1.57 1.59l12.76 12.77L27.1 1.59" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                  </NavLink>
                  <ul className="nav-dd">
                    {item.children.map((c) => (
                      <li key={c.to}>
                        <Link to={c.to}>{c.labelKey ? t(lang, c.labelKey) : c.label}</Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={item.to + item.labelKey}>
                  <NavLink to={item.to} end={item.end}>
                    {t(lang, item.labelKey)}
                  </NavLink>
                </li>
              )
            )}
          </ul>

          <div className="site-header__icons">
            {isAdmin && (
              <Link to="/admin" className="site-header__admin" title="Admin Dashboard">
                Admin
              </Link>
            )}
            <Link
              to={session ? '/account' : '/login'}
              className="site-header__icon"
              aria-label={session ? t(lang, 'account') : t(lang, 'login')}
            >
              <IconAccount />
            </Link>
            <button type="button" className="site-header__icon" aria-label={t(lang, 'search')} onClick={() => setSearchOpen((v) => !v)}>
              <IconSearch />
            </button>
            <button type="button" className="site-header__icon site-header__icon--cart" aria-label={t(lang, 'cart')} onClick={openCart}>
              <IconBag />
              <span className={`cart-dot${cartCount > 0 ? ' is-on' : ''}`}>{cartCount > 0 ? (cartCount > 9 ? '9+' : cartCount) : ''}</span>
            </button>
            <button type="button" className="site-header__icon site-header__menu-btn" aria-label="Menu" onClick={() => setDrawer(true)}>
              <IconMenu />
            </button>
          </div>
        </div>

        {searchOpen && (
          <form className="header-search" onSubmit={submitSearch}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث عن المنتجات…' : 'Search products…'}
            />
            <button type="submit" className="btn-pink">
              {t(lang, 'search')}
            </button>
          </form>
        )}
      </header>

      <div className={`mobile-drawer-backdrop${drawer ? ' is-open' : ''}`} onClick={closeDrawer} />
      <aside className={`mobile-drawer${drawer ? ' is-open' : ''}`} aria-hidden={!drawer}>
        <div className="mobile-drawer__top">
          <button type="button" className="mobile-drawer__close" aria-label="Close" onClick={closeDrawer}>
            ×
          </button>
        </div>
        <nav className="mobile-drawer__nav">
          <Link to="/" onClick={closeDrawer}>
            {t(lang, 'home')}
          </Link>
          <button type="button" className={`mobile-drawer__parent${catalogOpen ? ' open' : ''}`} onClick={() => setCatalogOpen((v) => !v)}>
            <span>{t(lang, 'catalogs')}</span>
            <span className="chev">▾</span>
          </button>
          {catalogOpen && (
            <div className="mobile-drawer__sub">
              <Link to="/catalogs" onClick={closeDrawer}>
                {lang === 'ar' ? 'كل المنتجات' : 'All Products'}
              </Link>
              <Link to="/full-body" onClick={closeDrawer}>
                {t(lang, 'fullBody')}
              </Link>
              <Link to="/partial-body" onClick={closeDrawer}>
                {t(lang, 'partialBody')}
              </Link>
              <Link to="/trunk" onClick={closeDrawer}>
                {t(lang, 'trunk')}
              </Link>
            </div>
          )}
          <Link to="/full-body" onClick={closeDrawer}>
            {t(lang, 'fullBody')}
          </Link>
          <Link to="/partial-body" onClick={closeDrawer}>
            {t(lang, 'partialBody')}
          </Link>
          <Link to="/trunk" onClick={closeDrawer}>
            {t(lang, 'trunk')}
          </Link>
          <Link to="/about" onClick={closeDrawer}>
            {t(lang, 'about')}
          </Link>
          <Link to="/contact" onClick={closeDrawer}>
            {t(lang, 'contact')}
          </Link>
          {isAdmin && (
            <Link to="/admin" onClick={closeDrawer} style={{ color: '#ff009a', fontWeight: 700 }}>
              Admin Dashboard
            </Link>
          )}
        </nav>
      </aside>
    </>
  );
}
