import { useEffect, useRef, useState } from 'react';
import {
  GT_DEFAULT,
  GT_LANGS,
  loadGoogleTranslate,
  readTranslateTarget,
  setTranslateTarget
} from '../lib/googleTranslate';

export default function LangFloat() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(() => readTranslateTarget() || GT_DEFAULT);
  const root = useRef(null);
  const active = GT_LANGS.find((l) => l.code === target) || GT_LANGS[0];

  useEffect(() => {
    // Defer GT so homepage images aren't blocked / browser isn't locked
    const t = window.setTimeout(() => loadGoogleTranslate(), 1500);
    setTarget(readTranslateTarget() || GT_DEFAULT);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onDoc(e) {
      if (!root.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(code) {
    setOpen(false);
    if (code === target && readTranslateTarget() === code) return;
    setTranslateTarget(code, { reload: true });
  }

  return (
    <div className={`lang-float skiptranslate${open ? ' is-open' : ''}`} ref={root} translate="no">
      {/* Hidden Google widget — required for the translate engine */}
      <div id="iae_google_translate_element" className="lang-float__gt-host" aria-hidden="true" />

      <button
        type="button"
        className="lang-float__btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Language"
      >
        <span className="lang-float__flag" aria-hidden="true">
          {active.flag}
        </span>
        <span>{active.label}</span>
        <span className="lang-float__chev">▾</span>
      </button>

      {open && (
        <ul className="lang-float__menu" role="listbox">
          {GT_LANGS.map((l) => (
            <li key={l.code}>
              <button type="button" className={target === l.code ? 'is-active' : ''} onClick={() => pick(l.code)}>
                <span className="lang-float__flag">{l.flag}</span>
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
