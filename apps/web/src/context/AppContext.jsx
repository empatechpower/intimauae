import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { DEFAULT_CURRENCY, DEFAULT_LANG } from '../lib/i18n';
import { applyDocumentDir, GT_DEFAULT, readTranslateTarget } from '../lib/googleTranslate';
import { isProfileReadyForSession, resolveIsAdmin } from '../lib/auth';

const CartCtx = createContext(null);
const KEY = 'intimauae_cart_v2';

function mergeCartWithCatalog(cartItems, products) {
  if (!cartItems.length || !products?.length) return cartItems;
  const byId = new Map();
  const byHandle = new Map();
  for (const p of products) {
    if (p.id != null) byId.set(String(p.id), p);
    if (p.handle) byHandle.set(p.handle, p);
  }
  let changed = false;
  const next = cartItems.map((item) => {
    const catalog =
      (item.id != null && byId.get(String(item.id))) || (item.handle && byHandle.get(item.handle));
    if (!catalog) return item;
    const price = catalog.price_aed ?? catalog.price;
    const samePrice =
      Number(item.price) === Number(price) && Number(item.price_aed ?? item.price) === Number(price);
    if (samePrice && item.title === catalog.title) return item;
    changed = true;
    return {
      ...item,
      title: catalog.title ?? item.title,
      price,
      price_aed: price,
      image: catalog.images?.[0] || item.image
    };
  });
  return changed ? next : cartItems;
}

export function AppProvider({ children }) {
  // UI string pack stays English (source). Display language comes from Google Translate.
  const [lang, setLang] = useState(DEFAULT_LANG);
  const [displayLang, setDisplayLang] = useState(() => readTranslateTarget() || GT_DEFAULT);
  const currency = DEFAULT_CURRENCY;
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(!supabase);
  /** null = none / loading; string = profile row loaded for that auth user id */
  const [profileLoadedForUserId, setProfileLoadedForUserId] = useState(null);
  const [qvProduct, setQvProduct] = useState(null);

  const profileReady = isProfileReadyForSession(authReady, session, profileLoadedForUserId);
  const isAdmin = resolveIsAdmin(session, profile);

  useEffect(() => {
    const target = readTranslateTarget() || GT_DEFAULT;
    setDisplayLang(target);
    applyDocumentDir(); // always LTR layout (CSS also pins direction)
    localStorage.removeItem('iae_currency');
    localStorage.removeItem('iae_currency_mode');
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (!cart.length) return undefined;
    let cancelled = false;
    const run = () => {
      api('/api/catalog/products')
        .then((d) => {
          if (cancelled) return;
          setCart((prev) => mergeCartWithCatalog(prev, d.products || []));
        })
        .catch(() => {});
    };
    run();
    const onFocus = () => run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cart.length]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!supabase || !userId) {
      setProfile(null);
      setProfileLoadedForUserId(null);
      return;
    }
    setProfileLoadedForUserId(null);
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data);
        setProfileLoadedForUserId(userId);
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setProfileLoadedForUserId(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [cartOpen]);

  const cartCount = cart.reduce((n, i) => n + (i.qty || 0), 0);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      displayLang,
      currency,
      cart,
      cartCount,
      cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addToCart(product, qty = 1) {
        setCart((prev) => {
          const id = product.id || product.handle;
          const found = prev.find((i) => (i.id || i.handle) === id);
          if (found) {
            const price = product.price_aed ?? product.price;
            return prev.map((i) =>
              (i.id || i.handle) === id
                ? {
                    ...i,
                    qty: i.qty + qty,
                    price,
                    price_aed: price,
                    title: product.title ?? i.title,
                    image: product.images?.[0] || product.image || i.image
                  }
                : i
            );
          }
          return [
            ...prev,
            {
              id: product.id,
              handle: product.handle,
              title: product.title,
              price: product.price_aed ?? product.price,
              price_aed: product.price_aed ?? product.price,
              image: product.images?.[0] || product.image,
              qty
            }
          ];
        });
        setCartOpen(true);
      },
      setQty(id, qty) {
        setCart((prev) => prev.map((i) => ((i.id || i.handle) === id ? { ...i, qty: Math.max(1, qty) } : i)));
      },
      removeFromCart(id) {
        setCart((prev) => prev.filter((i) => (i.id || i.handle) !== id));
      },
      clearCart() {
        setCart([]);
      },
      session,
      profile,
      isAdmin,
      token: session?.access_token || null,
      authReady,
      profileReady,
      qvProduct,
      openQuickView: setQvProduct,
      closeQuickView: () => setQvProduct(null)
    }),
    [lang, displayLang, currency, cart, cartCount, cartOpen, session, profile, isAdmin, authReady, profileReady, qvProduct]
  );

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}
