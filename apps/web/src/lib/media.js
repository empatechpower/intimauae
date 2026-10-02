export const STORAGE =
  'https://xmmvprhqkhebtwxfjjig.supabase.co/storage/v1/object/public/catalog';

export function media(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('/')) return path;
  const clean = path.replace(/^\/+/, '').replace(/^assets\/images\//, '');
  return `${STORAGE}/${clean}`;
}

/** Exact hero social images provided by the client */
export const HERO_SLIDES = [
  {
    src: '/hero/hero-daddy.jpg',
    title: 'Full Body Products',
    text: 'Lifelike full-size companions from Intimauae — premium materials, discreet UAE shipping.',
    cta: 'Shop Full Body',
    to: '/full-body'
  },
  {
    src: '/hero/hero-cowgirl.jpg',
    title: 'Premium Intimauae Catalog',
    text: 'Studio-finished companions with discreet UAE warehouse shipping.',
    cta: 'Browse All',
    to: '/catalogs'
  }
];
