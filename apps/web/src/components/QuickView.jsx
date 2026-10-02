import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatMoney, t } from '../lib/i18n';
import { media } from '../lib/media';

export default function QuickView() {
  const { qvProduct, closeQuickView, addToCart, currency, lang } = useApp();
  if (!qvProduct) return null;
  const p = qvProduct;
  return (
    <div className="qv-modal-overlay" onClick={closeQuickView}>
      <div className="qv-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="qv-modal-close" onClick={closeQuickView} aria-label="Close">
          ×
        </button>
        <div className="qv-modal-grid">
          <div className="qv-modal-media">
            <img className="qv-modal-img" src={media(p.images?.[0])} alt={p.title} />
          </div>
          <div className="qv-modal-body">
            <div className="qv-vendor">{p.vendor || 'INTIMAUAE'}</div>
            <h2 className="qv-title">{p.title}</h2>
            <div className="qv-rating">
              ★★★★★ {(p.rating || 4.8).toFixed?.(1) || p.rating} ({p.reviewsCount || p.reviews_count || 20})
            </div>
            <div className="qv-price-box">
              <span className="qv-price">{formatMoney(p.price, currency)}</span>
              {p.compare_at_price > p.price && <s className="qv-compare-price">{formatMoney(p.compare_at_price, currency)}</s>}
            </div>
            <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.55, maxHeight: 72, overflow: 'hidden' }}>{p.description}</p>
            <div className="qv-options">
              <div className="qv-opt-group">
                <label>Category</label>
                <div>{p.category || p.category_id}</div>
              </div>
              <div className="qv-opt-group">
                <label>Warehouse</label>
                <div>{p.warehouse || 'UAE Warehouse'}</div>
              </div>
            </div>
            <div className="qv-actions-row">
              <button
                type="button"
                className="qv-btn-cart"
                onClick={() => {
                  addToCart(p, 1);
                  closeQuickView();
                }}
              >
                {t(lang, 'addToCart')}
              </button>
              <Link to={`/products/${p.handle}`} className="qv-btn-view" onClick={closeQuickView}>
                FULL DETAILS →
              </Link>
            </div>
            <div className="qv-perks">
              <span>Discreet shipping</span>
              <span>Uniwebpay secure</span>
              <span>UAE warehouse</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
