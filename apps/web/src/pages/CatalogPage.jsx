import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard';
import { useApp } from '../context/AppContext';
import { t } from '../lib/i18n';

const CATEGORY_SLUGS = new Set(['full-body', 'partial-body', 'trunk']);

export default function CatalogPage() {
  const { pathname } = useLocation();
  const { lang } = useApp();
  const segment = pathname.replace(/^\//, '').split('/')[0] || 'catalogs';
  const pathCat = CATEGORY_SLUGS.has(segment) ? segment : null;
  const [products, setProducts] = useState([]);
  const [cat, setCat] = useState(pathCat || 'all');
  const [sort, setSort] = useState('featured');

  useEffect(() => {
    setCat(pathCat || 'all');
  }, [pathCat]);

  useEffect(() => {
    api('/api/catalog/products')
      .then((d) => setProducts(d.products || []))
      .catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    let list = [...products];
    if (cat === 'full-body') list = list.filter((p) => p.category_id === 'full-body' || p.category === 'Full Body Products');
    if (cat === 'partial-body') list = list.filter((p) => p.category_id === 'partial-body' || p.category === 'Partial Body Products');
    if (cat === 'trunk') list = list.filter((p) => p.category_id === 'trunk' || p.category === 'Trunk');
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    return list;
  }, [products, cat, sort]);

  const title =
    cat === 'full-body'
      ? t(lang, 'fullBody')
      : cat === 'partial-body'
        ? t(lang, 'partialBody')
        : cat === 'trunk'
          ? t(lang, 'trunk')
          : lang === 'ar'
            ? 'كل المنتجات'
            : 'All Products';

  return (
    <main className="wrap catalog-layout">
      <aside className="catalog-sidebar">
        <h4>{lang === 'ar' ? 'الفئة' : 'Category'}</h4>
        {[
          ['all', lang === 'ar' ? 'كل المنتجات' : 'All Products'],
          ['full-body', t(lang, 'fullBody')],
          ['partial-body', t(lang, 'partialBody')],
          ['trunk', t(lang, 'trunk')]
        ].map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="cat" checked={cat === value} onChange={() => setCat(value)} /> {label}
          </label>
        ))}
        <h4>{lang === 'ar' ? 'ترتيب' : 'Sort'}</h4>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: '100%', background: '#0b1320', color: '#fff', border: '1px solid rgba(255,255,255,.15)', padding: 8 }}>
          <option value="featured">Featured</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </aside>
      <section>
        <div className="catalog-topbar">
          <h1>{title}</h1>
          <div className="count" style={{ color: '#9aa6b2' }}>
            {filtered.length} items
          </div>
        </div>
        <div className="product-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {filtered.map((p) => (
            <ProductCard key={p.id || p.handle} product={p} />
          ))}
        </div>
      </section>
    </main>
  );
}
