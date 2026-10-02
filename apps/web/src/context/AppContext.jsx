import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_CURRENCY, DEFAULT_LANG } from '../lib/i18n';
import { applyDocumentDir, GT_DEFAULT, readTranslateTarget } from '../lib/googleTranslate';
import { isProfileReadyForSession, resolveIsAdmin } from '../lib/auth';

const CartCtx = createContext(null);
const KEY = 'intimauae_cart_v2';

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
            return prev.map((i) => ((i.id || i.handle) === id ? { ...i, qty: i.qty + qty } : i));
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
