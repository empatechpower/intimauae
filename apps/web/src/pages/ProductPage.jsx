import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatMoney, t } from '../lib/i18n';
import { media } from '../lib/media';

export default function ProductPage() {
  const { handle } = useParams();
  const { currency, lang, addToCart } = useApp();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [main, setMain] = useState('');

  useEffect(() => {
    api(`/api/catalog/products/${handle}`)
      .then((d) => {
        setProduct(d.product);
        setMain(d.product?.images?.[0] || '');
      })
      .catch(console.error);
  }, [handle]);

  if (!product) return <main className="page-wrap wrap" style={{ padding: 40 }}>Loading…</main>;

  const images = product.images?.length ? product.images : [main].filter(Boolean);

  return (
    <div className="template-product-page">
      <main className="product-page">
        <nav className="product-crumbs">
          <Link to="/">Home</Link> / <Link to={`/${product.category_id || 'catalogs'}`}>{product.category || product.category_id}</Link> /{' '}
          {product.title}
        </nav>
        <div className="product-layout">
          <div className={`product-gallery${images.length <= 1 ? ' product-gallery--solo' : ''}`}>
            {images.length > 1 && (
              <div className="product-thumbs" role="list">
                {images.map((src) => (
                  <button
                    key={src}
                    type="button"
                    role="listitem"
                    className={`product-thumb${main === src ? ' is-active' : ''}`}
                    onClick={() => setMain(src)}
                    aria-label="View image"
                  >
                    <img src={media(src)} alt="" />
                  </button>
                ))}
              </div>
            )}
            <div className="product-main-shot">
              <img src={media(main || images[0])} alt={product.title} />
            </div>
          </div>

          <div>
            <div className="product-vendor">{product.vendor || 'INTIMAUAE'}</div>
            <h1 className="product-title">{product.title}</h1>
            <div className="product-prices">
              {product.compare_at_price > product.price && <s>{formatMoney(product.compare_at_price, currency)}</s>}
              {formatMoney(product.price, currency)}
            </div>
            <div className="product-tax">Tax included. Shipping calculated at checkout.</div>
            <div className="product-badge">{product.warehouse || 'UAE Warehouse'} · Discreet Shipping</div>
            <p className="product-desc" dangerouslySetInnerHTML={{ __html: product.description || '' }} />
            <table className="product-specs">
              <tbody>
                {[
                  ['Brand', product.vendor || 'Intimauae'],
                  ['Category', product.category || product.category_id],
                  ['Height', product.height || '—'],
                  ['Material', product.material || '—'],
                  ['Skeleton', product.skeleton || '—'],
                  ['Warehouse', product.warehouse || 'UAE Warehouse']
                ].map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="product-form-row">
              <div className="qty-box">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                  −
                </button>
                <input value={qty} readOnly />
                <button type="button" onClick={() => setQty((q) => q + 1)}>
                  +
                </button>
              </div>
              <button type="button" className="btn-add" onClick={() => addToCart(product, qty)}>
                {t(lang, 'addToCart')}
              </button>
            </div>
            <p style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>Secure payments via Uniwebpay</p>
          </div>
        </div>
      </main>
    </div>
  );
}
