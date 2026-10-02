import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { CURRENCIES, t } from '../lib/i18n';

export default function CurrencyFloat() {
  const { currency, setCurrency, autoLocation, applyAutoLocation, lang } = useApp();
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!root.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const active = CURRENCIES[currency] || CURRENCIES.USD;

  return (
    <div className={`currency-float${open ? ' is-open' : ''}`} ref={root}>
      <button type="button" className="currency-float__btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="currency-float__flag" aria-hidden="true">
          {active.flag}
        </span>
        <span>{autoLocation ? t(lang, 'autoLocation') : active.code}</span>
        <span className="currency-float__chev">▾</span>
      </button>
      {open && (
        <ul className="currency-float__menu" role="listbox">
          <li>
            <button
              type="button"
              className={autoLocation ? 'is-active' : ''}
              onClick={() => {
                applyAutoLocation();
                setOpen(false);
              }}
            >
              <span className="currency-float__flag">🌐</span>
              {t(lang, 'autoLocation')}
            </button>
          </li>
          {Object.values(CURRENCIES).map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className={!autoLocation && currency === c.code ? 'is-active' : ''}
                onClick={() => {
                  setCurrency(c.code);
                  setOpen(false);
                }}
              >
                <span className="currency-float__flag">{c.flag}</span>
                {c.code}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
