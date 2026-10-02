import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const CACHE_KEY = 'iae_public_settings_v2';

function readCache() {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function usePublicSettings() {
  const [settings, setSettings] = useState(() => readCache());

  useEffect(() => {
    api('/api/settings/public')
      .then((d) => {
        const s = d.settings || {};
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(s));
        setSettings(s);
      })
      .catch(() => setSettings((prev) => prev || {}));
  }, []);

  return settings || {};
}

function upsertMeta(name, content, attr = 'name') {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function SiteSeo() {
  const s = usePublicSettings();
  const seo = s.site_seo || {};

  useEffect(() => {
    if (seo.title) document.title = seo.title;
    upsertMeta('description', seo.description);
    upsertMeta('keywords', seo.keywords);
    upsertMeta('og:title', seo.title || document.title, 'property');
    upsertMeta('og:description', seo.description, 'property');
    if (seo.og_image) upsertMeta('og:image', seo.og_image, 'property');
  }, [seo.title, seo.description, seo.keywords, seo.og_image]);

  return null;
}

export function GoogleTags() {
  const s = usePublicSettings();
  const ga = String(s.google_analytics_id || '').trim();
  const gtm = String(s.google_tag_manager_id || '').trim();
  const ads = String(s.google_ads_id || '').trim();

  useEffect(() => {
    if (gtm && !document.getElementById('iae-gtm')) {
      const s1 = document.createElement('script');
      s1.id = 'iae-gtm';
      s1.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`;
      document.head.appendChild(s1);
      const nos = document.createElement('noscript');
      nos.id = 'iae-gtm-noscript';
      nos.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
      document.body.prepend(nos);
    }
    if (ga && !document.getElementById('iae-ga')) {
      const s1 = document.createElement('script');
      s1.id = 'iae-ga';
      s1.async = true;
      s1.src = `https://www.googletagmanager.com/gtag/js?id=${ga}`;
      document.head.appendChild(s1);
      const s2 = document.createElement('script');
      s2.id = 'iae-ga-config';
      s2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');${ads ? `gtag('config','${ads}');` : ''}`;
      document.head.appendChild(s2);
    }
  }, [ga, gtm, ads]);

  return null;
}

export function WhatsAppWidget() {
  const s = usePublicSettings();
  const wa = s.whatsapp || {};
  if (!wa.enabled || !wa.number) return null;
  const num = String(wa.number).replace(/[^\d]/g, '');
  const text = encodeURIComponent(wa.message || 'Hello Intimauae');
  const href = `https://wa.me/${num}?text=${text}`;
  return (
    <a className="wa-float" href={href} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.01 3C9.39 3 4 8.35 4 14.92c0 2.1.56 4.14 1.62 5.95L4 29l8.36-2.18a12.1 12.1 0 0 0 3.65.56h.01c6.62 0 12.01-5.35 12.01-11.92C28.03 8.35 22.63 3 16.01 3zm6.96 16.88c-.29.82-1.7 1.51-2.38 1.61-.61.09-1.38.13-2.23-.14-.51-.16-1.17-.38-2.02-.74-3.55-1.54-5.86-5.12-6.04-5.36-.18-.24-1.45-1.93-1.45-3.68 0-1.75.92-2.61 1.24-2.97.33-.36.71-.45.95-.45h.68c.22 0 .51-.08.8.61.29.71.99 2.45 1.08 2.63.09.18.15.39.03.63-.12.24-.18.39-.36.6-.18.21-.38.47-.54.63-.18.18-.36.37-.15.72.21.36.93 1.53 2 2.48 1.38 1.22 2.54 1.6 2.9 1.78.36.18.57.15.78-.09.21-.24.9-1.05 1.14-1.41.24-.36.48-.3.8-.18.33.12 2.08 1 2.44 1.18.36.18.6.27.69.42.09.15.09.87-.2 1.69z"
        />
      </svg>
    </a>
  );
}

export function SitePopup() {
  const s = usePublicSettings();
  const popup = s.site_popup || {};
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!popup.enabled) return;
    const key = `iae_popup_dismiss_${popup.version || '1'}`;
    if (localStorage.getItem(key)) return;
    const t = setTimeout(() => setOpen(true), Number(popup.delay_ms) || 1200);
    return () => clearTimeout(t);
  }, [popup.enabled, popup.version, popup.delay_ms]);

  if (!open || !popup.enabled) return null;

  function dismiss() {
    localStorage.setItem(`iae_popup_dismiss_${popup.version || '1'}`, '1');
    setOpen(false);
  }

  return (
    <div className="site-popup-backdrop" role="dialog" aria-modal="true">
      <div className="site-popup">
        <button type="button" className="site-popup__close" onClick={dismiss} aria-label="Close">
          ×
        </button>
        {popup.image ? <img className="site-popup__img" src={popup.image} alt="" /> : <div className="site-popup__icon">%</div>}
        <h2>{popup.title || 'Special offer'}</h2>
        <p>{popup.subtitle || ''}</p>
        {popup.coupon_code ? (
          <div className="site-popup__code">
            Use code <strong>{popup.coupon_code}</strong>
          </div>
        ) : null}
        {popup.cta_url ? (
          <a className="site-popup__cta" href={popup.cta_url} onClick={dismiss}>
            {popup.cta_text || 'Shop now'}
          </a>
        ) : (
          <button type="button" className="site-popup__cta" onClick={dismiss}>
            {popup.cta_text || 'Got it'}
          </button>
        )}
        <button type="button" className="site-popup__dismiss" onClick={dismiss}>
          {popup.dismiss_label || 'No thanks'}
        </button>
      </div>
    </div>
  );
}
