import { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES, DEFAULT_DIAL } from '../lib/countries';

export default function CountryDialSelect({ value = DEFAULT_DIAL, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const selected = useMemo(
    () => COUNTRIES.find((c) => c.code === value && (value !== '+1' || c.iso === 'US')) || COUNTRIES.find((c) => c.code === value) || COUNTRIES.find((c) => c.iso === 'AE'),
    [value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.iso.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div className={`auth-dial-pick${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="auth-dial-pick__btn"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="auth-dial-pick__code">{selected?.code || value}</span>
        <span className="auth-dial-pick__name">
          {selected?.iso === 'AE' ? `${selected.name} ★` : selected?.name || 'Country'}
        </span>
        <span className="auth-dial-pick__chev" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="auth-dial-pick__menu notranslate" translate="no" role="listbox">
          <input
            ref={searchRef}
            className="auth-dial-pick__search"
            type="search"
            placeholder="Search country…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <div className="auth-dial-pick__list">
            {filtered.map((c) => (
              <button
                key={`${c.iso}-${c.code}`}
                type="button"
                role="option"
                aria-selected={c.code === value && c.iso === selected?.iso}
                className={`auth-dial-pick__option${c.iso === selected?.iso ? ' is-active' : ''}${c.iso === 'AE' ? ' is-default' : ''}`}
                onClick={() => {
                  onChange?.(c.code);
                  setOpen(false);
                }}
              >
                <span>{c.name}{c.iso === 'AE' ? ' ★' : ''}</span>
                <span className="auth-dial-pick__option-code">{c.code}</span>
              </button>
            ))}
            {!filtered.length && <div className="auth-dial-pick__empty">No countries match</div>}
          </div>
        </div>
      )}
    </div>
  );
}
