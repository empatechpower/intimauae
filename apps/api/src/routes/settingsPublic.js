import { Router } from 'express';
import { dbQuery, hasDatabaseUrl } from '../lib/db.js';
import {
  PRIVACY_HTML,
  SHIPPING_HTML,
  REFUND_HTML,
  DEFAULT_SITE_BANNER,
  DEFAULT_HERO_SLIDES,
  DEFAULT_ABOUT
} from '../data/cmsDefaults.js';

export const settingsPublicRouter = Router();

const DEFAULTS = {
  site_seo: {
    title: 'Intimauae | Premium Body Products UAE',
    description: 'Shop Full Body, Partial Body, and Trunk products from Intimauae. Discreet shipping across the UAE.',
    keywords: 'intimauae, silicone doll, UAE',
    og_image: ''
  },
  google_analytics_id: '',
  google_tag_manager_id: '',
  google_ads_id: '',
  whatsapp: { enabled: false, number: '', message: 'Hi Intimauae, I have a question.' },
  site_popup: {
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
  },
  site_banner: { ...DEFAULT_SITE_BANNER },
  hero_slides: DEFAULT_HERO_SLIDES.map((s) => ({ ...s })),
  page_about: { ...DEFAULT_ABOUT },
  page_contact: {
    hero_title: 'Contact Us',
    hero_subtitle: 'Questions about materials, sizing, or discreet shipping? Send a message — we reply privately.',
    email: 'support@intimauae.ae',
    hours_title: 'Business hours',
    hours: 'Sunday–Thursday\n10:00–18:00 GST',
    payments_note: 'Secure checkout powered by Uniwebpay.'
  },
  page_faqs: {
    items: [
      { q: 'How discreet is shipping?', a: 'Unmarked packaging with neutral labeling.' },
      { q: 'What payment methods do you accept?', a: 'Secure checkout through Uniwebpay (SGD charge).' },
      { q: 'Where do you ship from?', a: 'UAE Warehouse with private delivery options.' }
    ]
  },
  page_privacy_policy: { title: 'Privacy Policy', html: PRIVACY_HTML },
  page_shipping_policy: { title: 'Shipping Policy', html: SHIPPING_HTML },
  page_refund_policy: { title: 'Refund Policy', html: REFUND_HTML }
};

function mergeSetting(key, stored, fallback) {
  if (stored == null) return fallback;
  if (key.startsWith('page_') && key.endsWith('_policy')) {
    const html = String(stored.html || '');
    // Replace old one-line stubs with full default copy
    if (!html || html.length < 180) {
      return { title: stored.title || fallback.title, html: fallback.html };
    }
    return { ...fallback, ...stored };
  }
  if (key === 'page_about') {
    const html = String(stored.html || '');
    if (!html || html.length < 80) {
      return {
        title: stored.title || fallback.title,
        subtitle: stored.subtitle || fallback.subtitle,
        html: fallback.html
      };
    }
    return { ...fallback, ...stored };
  }
  if (key === 'hero_slides') {
    return Array.isArray(stored) && stored.length ? stored : fallback;
  }
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && fallback && typeof fallback === 'object') {
    return { ...fallback, ...stored };
  }
  return stored;
}

settingsPublicRouter.get('/public', async (_req, res, next) => {
  try {
    const settings = structuredClone(DEFAULTS);
    if (hasDatabaseUrl()) {
      const { rows } = await dbQuery(`select key, value from public.settings where key = any($1::text[])`, [
        Object.keys(DEFAULTS)
      ]);
      for (const r of rows) {
        settings[r.key] = mergeSetting(r.key, r.value, DEFAULTS[r.key]);
      }
    }
    res.json({ settings });
  } catch (e) {
    next(e);
  }
});
