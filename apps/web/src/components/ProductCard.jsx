import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../lib/i18n';
import { media } from '../lib/media';

export default function ProductCard({ product }) {
  const { currency, openQuickView } = useApp();
  const img = media(product.images?.[0] || '');
  return (
    <Link
      to={`/products/${product.handle}`}
      className="product-card"
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          openQuickView(product);
        }
      }}
    >
      <div className="thumb">
        <img src={img} alt={product.title} loading="lazy" />
      </div>
      <div className="meta">
        <div className="vendor">{product.category || product.category_id || 'Intimauae'}</div>
        <div className="title">{product.title}</div>
        <div className="price">
          {product.compare_at_price > product.price && <s>{formatMoney(product.compare_at_price, currency)}</s>}
          {formatMoney(product.price, currency)}
        </div>
      </div>
    </Link>
  );
}
