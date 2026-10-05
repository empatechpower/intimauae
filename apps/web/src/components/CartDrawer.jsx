import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatMoney, t } from '../lib/i18n';
import { media } from '../lib/media';

export default function CartDrawer() {
  const { cart, cartOpen, closeCart, currency, lang, session, setQty, removeFromCart } = useApp();
  const nav = useNavigate();
  const subtotal = cart.reduce((n, i) => n + Number(i.price_aed || i.price) * i.qty, 0);
  const empty = !cart.length;

  function goCheckout() {
    closeCart();
    if (!session) {
      nav('/login', { state: { from: '/checkout' } });
      return;
    }
    nav('/checkout');
  }

  return (
    <>
      <div className={`cart-drawer-backdrop${cartOpen ? ' is-open' : ''}`} onClick={closeCart} />
      <aside className={`cart-drawer${cartOpen ? ' is-open' : ''}${empty ? ' is-empty' : ''}`} aria-hidden={!cartOpen}>
        <div className="cart-drawer__header">
          <div className="cart-drawer__title">{t(lang, 'cart')}</div>
          <button type="button" className="cart-drawer__close" aria-label="Close cart" onClick={closeCart}>
            ×
          </button>
        </div>

        <div className="cart-drawer__body">
          {empty ? (
            <p className="cart-drawer__empty">{t(lang, 'cartEmpty')}</p>
          ) : (
            cart.map((it) => (
              <div className="cart-drawer__item" key={it.id}>
                <Link to={`/products/${it.handle}`} className="cart-drawer__thumb" onClick={closeCart}>
                  <img src={media(it.image)} alt="" />
                </Link>
                <div className="cart-drawer__meta">
                  <Link to={`/products/${it.handle}`} onClick={closeCart}>
                    {it.title}
                  </Link>
                  <div className="cart-drawer__opts">
                    <div>Warehouse: {it.warehouse || 'UAE Warehouse'}</div>
                  </div>
                  <div className="cart-drawer__row">
                    <div className="cart-drawer__qty">
                      <button type="button" onClick={() => setQty(it.id, it.qty - 1)} aria-label="Decrease">
                        −
                      </button>
                      <span>{it.qty}</span>
                      <button type="button" onClick={() => setQty(it.id, it.qty + 1)} aria-label="Increase">
                        +
                      </button>
                    </div>
                    <div className="cart-drawer__price">{formatMoney((it.price_aed || it.price) * it.qty, currency)}</div>
                    <button type="button" className="cart-drawer__remove" onClick={() => removeFromCart(it.id)}>
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {!empty && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__subtotal">
              <span>{t(lang, 'subtotal')}</span>
              <strong>{formatMoney(subtotal, currency)}</strong>
            </div>
            <p className="cart-drawer__note">{t(lang, 'paymentsBy')}</p>
            <button type="button" className="btn-pink cart-drawer__checkout" onClick={goCheckout}>
              {t(lang, 'checkout')}
            </button>
            <Link to="/cart" className="cart-drawer__view" onClick={closeCart}>
              {lang === 'ar' ? 'عرض السلة الكاملة' : 'View full cart'}
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
