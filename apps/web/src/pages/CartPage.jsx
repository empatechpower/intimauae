import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatMoney, t } from '../lib/i18n';
import { media } from '../lib/media';

export default function CartPage() {
  const { cart, currency, lang, session, setQty, removeFromCart } = useApp();
  const nav = useNavigate();
  const subtotal = cart.reduce((n, i) => n + Number(i.price_aed || i.price) * i.qty, 0);

  function goCheckout() {
    if (!session) {
      nav('/login', { state: { from: '/checkout' } });
      return;
    }
    nav('/checkout');
  }

  if (!cart.length) {
    return (
      <main className="wrap" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <p style={{ fontSize: 18 }}>{lang === 'ar' ? 'سلتك فارغة' : 'Your cart is empty.'}</p>
        <Link to="/catalogs" className="btn-pink" style={{ marginTop: 16 }}>
          {t(lang, 'continueShopping')}
        </Link>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ padding: '36px 0 60px' }}>
      <h1 style={{ fontFamily: 'Poppins,sans-serif', marginBottom: 20 }}>{lang === 'ar' ? 'سلتك' : 'Your Cart'}</h1>
      {cart.map((it) => (
        <div
          key={it.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 40px',
            gap: 12,
            alignItems: 'center',
            padding: '16px 0',
            borderBottom: '1px solid rgba(255,255,255,.08)'
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <img src={media(it.image)} alt="" style={{ width: 84, height: 112, objectFit: 'cover' }} />
            <div>
              <Link to={`/products/${it.handle}`} style={{ fontWeight: 600, textDecoration: 'none' }}>
                {it.title}
              </Link>
              <div style={{ color: '#9aa6b2', fontSize: 13, marginTop: 4 }}>{formatMoney(it.price_aed || it.price, currency)}</div>
            </div>
          </div>
          <input
            type="number"
            min={1}
            value={it.qty}
            onChange={(e) => setQty(it.id, parseInt(e.target.value || '1', 10))}
            style={{ width: 72, padding: 8, background: '#131e2b', color: '#fff', border: '1px solid rgba(255,255,255,.2)' }}
          />
          <div style={{ fontWeight: 700 }}>{formatMoney((it.price_aed || it.price) * it.qty, currency)}</div>
          <button type="button" onClick={() => removeFromCart(it.id)} style={{ border: 0, background: 'transparent', color: '#999', fontSize: 20, cursor: 'pointer' }}>
            ×
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <div>
          <div style={{ color: '#9aa6b2' }}>{lang === 'ar' ? 'المجموع' : 'Subtotal'}</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 12px' }}>{formatMoney(subtotal, currency)}</div>
          <p style={{ color: '#9aa6b2', fontSize: 13 }}>{t(lang, 'paymentsBy')}</p>
          <button type="button" className="btn-pink" onClick={goCheckout}>
            {t(lang, 'checkout')}
          </button>
        </div>
      </div>
    </main>
  );
}
