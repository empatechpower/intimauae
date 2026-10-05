import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatMoney } from '../lib/i18n';
import { media } from '../lib/media';

const SHIPPING_USD = 0;

function loadCheckoutFrames() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.Frames) return Promise.resolve(window.Frames);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cko-frames]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Frames));
      existing.addEventListener('error', () => reject(new Error('Failed to load card form')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.checkout.com/js/framesv2.min.js';
    s.async = true;
    s.dataset.ckoFrames = '1';
    s.onload = () => resolve(window.Frames);
    s.onerror = () => reject(new Error('Failed to load card form'));
    document.head.appendChild(s);
  });
}

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const existingOrderId = params.get('order');
  const status = params.get('status');
  const { cart, token, session, authReady, profileReady, clearCart, closeCart } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const framesReady = useRef(false);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState('');
  const [coupon, setCoupon] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [framesPk, setFramesPk] = useState('');
  const [cardValid, setCardValid] = useState(false);
  const [framesError, setFramesError] = useState('');
  const [form, setForm] = useState({
    email: session?.user?.email || '',
    firstName: '',
    lastName: '',
    address: '',
    apartment: '',
    city: '',
    country: 'United Arab Emirates',
    postal: '',
    phone: ''
  });

  // Allow success/fail return pages without forcing re-login mid-redirect
  const isReturnStatus = status === 'success' || status === 'fail';
  const authBlocked = !isReturnStatus && (!authReady || !session || (session && !profileReady));

  useEffect(() => {
    closeCart?.();
  }, [closeCart]);

  useEffect(() => {
    if (session?.user?.email) setForm((f) => ({ ...f, email: f.email || session.user.email }));
  }, [session]);

  useEffect(() => {
    if (authBlocked) return undefined;
    let cancelled = false;
    api('/api/payments/config')
      .then((d) => {
        if (!cancelled) setFramesPk(d.checkoutFramesPk || '');
        // #region agent log
        const pk = String(d.checkoutFramesPk || '');
        fetch('http://127.0.0.1:7398/ingest/861237c1-f1ab-4e9f-a0fd-8609812f0e0b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '668c64' },
          body: JSON.stringify({
            sessionId: '668c64',
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'CheckoutPage.jsx:config',
            message: 'checkout frames pk loaded',
            data: {
              framesPkPrefix: pk.slice(0, 12) || null,
              framesPkIsLive: pk.startsWith('pk_live_'),
              framesPkIsTest: pk.startsWith('pk_test_'),
              paymentReady: Boolean(d.ready)
            },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion
      })
      .catch(() => {
        if (!cancelled) setFramesError('Could not load payment configuration.');
      });
    return () => {
      cancelled = true;
    };
  }, [authBlocked]);

  useEffect(() => {
    if (authBlocked) return undefined;
    if (!framesPk || status === 'success' || status === 'fail') return undefined;
    let cancelled = false;
    let validationHandler = null;

    (async () => {
      try {
        const Frames = await loadCheckoutFrames();
        if (cancelled || !Frames) return;
        if (framesReady.current) {
          try {
            Frames.init({ publicKey: framesPk });
          } catch {
            /* re-init best effort */
          }
        } else {
          Frames.init({ publicKey: framesPk });
          framesReady.current = true;
        }
        validationHandler = () => setCardValid(Boolean(Frames.isCardValid?.()));
        Frames.addEventHandler(Frames.Events.CARD_VALIDATION_CHANGED, validationHandler);
        setFramesError('');
      } catch (e) {
        if (!cancelled) setFramesError(e.message || 'Card form failed to load.');
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (window.Frames && validationHandler) {
          window.Frames.removeEventHandler?.(window.Frames.Events.CARD_VALIDATION_CHANGED, validationHandler);
        }
      } catch {
        /* ignore */
      }
    };
  }, [authBlocked, framesPk, status]);

  const subtotal = useMemo(
    () => cart.reduce((n, i) => n + Number(i.price_aed || i.price) * i.qty, 0),
    [cart]
  );
  const discount = Math.round(subtotal * discountPct * 100) / 100;
  const total = Math.max(0, subtotal - discount + SHIPPING_USD);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function applyCoupon(e) {
    e.preventDefault();
    const code = coupon.trim().toUpperCase();
    if (code === 'INTIMA15' || code === 'SDP15') {
      setDiscountPct(0.15);
      setMsg('Discount applied.');
    } else if (!code) {
      setDiscountPct(0);
      setMsg('');
    } else {
      setDiscountPct(0);
      setMsg('Invalid discount code.');
    }
  }

  async function payNow(e) {
    e.preventDefault();
    if (!session) {
      nav('/login', { state: { from: returnTo || '/checkout' } });
      return;
    }
    if (!cart.length && !existingOrderId) {
      setMsg('Your cart is empty.');
      return;
    }
    if (!window.Frames || !framesPk) {
      setMsg('Card form is not ready. Please refresh and try again.');
      return;
    }
    if (!window.Frames.isCardValid?.()) {
      setMsg('Please enter valid card details.');
      return;
    }

    setPaying(true);
    setMsg('');
    try {
      const tokenized = await window.Frames.submitCard();
      const cardToken = tokenized?.token;
      if (!cardToken) {
        setMsg('Could not tokenize card. Please check your card details.');
        return;
      }

      let orderId = existingOrderId;
      if (!orderId) {
        const shipping_address = {
          full_name: `${form.firstName} ${form.lastName}`.trim(),
          phone: form.phone,
          line1: form.address,
          line2: form.apartment,
          city: form.city,
          country: form.country,
          postal: form.postal
        };
        const { order } = await api('/api/orders', {
          method: 'POST',
          token,
          body: {
            email: form.email,
            items: cart,
            shipping_address,
            notes: discountPct ? `coupon:${coupon.trim().toUpperCase()}` : undefined
          }
        });
        orderId = order.id;
      }

      const res = await api('/api/payments/create', {
        method: 'POST',
        token,
        body: {
          orderId,
          cardToken,
          successUrl: `${window.location.origin}/checkout?status=success&order=${orderId}`,
          failUrl: `${window.location.origin}/checkout?status=fail&order=${orderId}`
        }
      });

      if (res.redirectUrl) {
        clearCart();
        window.location.href = res.redirectUrl;
        return;
      }
      // Only show success when the charge is confirmed (not merely "request accepted")
      if (res.ok && res.paid) {
        clearCart();
        nav(`/checkout?status=success&order=${orderId}`, { replace: true });
        return;
      }
      if (res.ok) {
        setMsg(
          'Payment is still processing. If money left your card, keep your order reference and contact support. Do not pay again yet.'
        );
        return;
      }
      setMsg('Something went wrong. Please try again or contact support.');
    } catch (err) {
      setMsg(err?.message || 'Something went wrong. Please try again or contact support.');
    } finally {
      setPaying(false);
      try {
        window.Frames?.enableSubmitForm?.();
      } catch {
        /* ignore */
      }
    }
  }

  if (!authReady && !isReturnStatus) {
    return (
      <main className="checkout-page">
        <div className="checkout-success">
          <p className="muted">Restoring session…</p>
        </div>
      </main>
    );
  }

  if (!session && !isReturnStatus) {
    return <Navigate to="/login" replace state={{ from: returnTo || '/checkout' }} />;
  }

  if (session && !profileReady && !isReturnStatus) {
    return (
      <main className="checkout-page">
        <div className="checkout-success">
          <p className="muted">Loading your account…</p>
        </div>
      </main>
    );
  }

  if (status === 'success') {
    return (
      <main className="checkout-page">
        <div className="checkout-success">
          <h1>Thank you</h1>
          <p>Your order is confirmed{params.get('order') ? ` (#${params.get('order').slice(0, 8)})` : ''}.</p>
          <p className="muted">A confirmation email will follow shortly.</p>
          <Link className="btn-pink" to="/account/orders">
            My Orders
          </Link>
          <Link to="/catalogs" style={{ marginInlineStart: 12 }}>
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  if (status === 'fail') {
    return (
      <main className="checkout-page">
        <div className="checkout-success">
          <h1>Something went wrong</h1>
          <p className="muted">We couldn’t complete your payment. Please try again or contact support.</p>
          <Link className="btn-pink" to="/checkout">
            Try again
          </Link>
          <Link to="/contact" style={{ marginInlineStart: 12 }}>
            Contact us
          </Link>
        </div>
      </main>
    );
  }

  if (!cart.length && !existingOrderId) {
    return (
      <main className="checkout-page">
        <div className="checkout-success">
          <h1>Checkout</h1>
          <p>Your cart is empty.</p>
          <Link className="btn-pink" to="/catalogs">
            Browse catalog
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <form className="checkout-grid" onSubmit={payNow}>
        <div className="checkout-form">
          <section>
            <div className="checkout-section-head">
              <h2>Contact</h2>
            </div>
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
          </section>

          <section>
            <h2>Shipping address</h2>
            <div className="checkout-row2">
              <input
                required
                placeholder="First name"
                value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
              />
              <input
                required
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
              />
            </div>
            <input
              required
              placeholder="Address"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
            <input
              placeholder="Apartment, suite, etc. (optional)"
              value={form.apartment}
              onChange={(e) => setField('apartment', e.target.value)}
            />
            <div className="checkout-row2">
              <input required placeholder="City" value={form.city} onChange={(e) => setField('city', e.target.value)} />
              <input
                required
                placeholder="Postal code"
                value={form.postal}
                onChange={(e) => setField('postal', e.target.value)}
              />
            </div>
            <div className="checkout-row2">
              <input
                required
                placeholder="Country"
                value={form.country}
                onChange={(e) => setField('country', e.target.value)}
              />
              <input required placeholder="Phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
          </section>

          <section>
            <h2>Shipping method</h2>
            <div className="checkout-ship">
              <span>Standard · UAE Warehouse</span>
              <strong>{SHIPPING_USD ? formatMoney(SHIPPING_USD) : 'Free'}</strong>
            </div>
          </section>

          <section>
            <h2>Payment</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Enter your card details below. Card numbers are tokenized by Checkout.com — we never store them.
            </p>
            <div className="checkout-pay-card">
              <div className="checkout-pay-title">Secure card payment</div>
              {!framesPk && !framesError ? <p className="muted">Loading card form…</p> : null}
              {framesError ? <p className="checkout-warn">{framesError}</p> : null}
              <div className="card-frame" />
            </div>
          </section>

          <button type="submit" className="checkout-pay-btn" disabled={paying || !framesPk || (!cardValid && !!framesPk)}>
            {paying ? 'Processing…' : 'Pay now'}
          </button>
          {msg && <p className="checkout-msg">{msg}</p>}

          <div className="checkout-policies">
            <Link to="/policies/refund-policy">Refund policy</Link>
            <Link to="/policies/shipping-policy">Shipping</Link>
            <Link to="/policies/privacy-policy">Privacy policy</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>

        <aside className="checkout-summary">
          <div className="checkout-items">
            {cart.map((it) => (
              <div className="checkout-item" key={it.id}>
                <div className="checkout-item-thumb">
                  <img src={media(it.image)} alt="" />
                  <span>{it.qty}</span>
                </div>
                <div className="checkout-item-meta">
                  <div className="checkout-item-title">{it.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {it.warehouse || 'UAE Warehouse'}
                  </div>
                </div>
                <div className="checkout-item-price">{formatMoney((it.price_aed || it.price) * it.qty)}</div>
              </div>
            ))}
          </div>

          <div className="checkout-coupon">
            <input placeholder="Discount code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
            <button type="button" onClick={applyCoupon}>
              Apply
            </button>
          </div>

          <div className="checkout-totals">
            <div>
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div>
                <span>Order discount</span>
                <span>−{formatMoney(discount)}</span>
              </div>
            )}
            <div>
              <span>Shipping</span>
              <span>{SHIPPING_USD ? formatMoney(SHIPPING_USD) : 'Free'}</span>
            </div>
            <div className="checkout-total">
              <span>Total</span>
              <strong>
                <small>USD</small> {formatMoney(total)}
              </strong>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Your card is charged the SGD equivalent of this USD total via our payment partner.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}
