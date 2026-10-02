/** Google Translate helpers — English source, Arabic default. Layout stays LTR via CSS only. */

export const GT_SOURCE = 'en';
export const GT_DEFAULT = 'ar';

export const GT_LANGS = [
  { code: 'ar', label: 'العربية', flag: '🇦🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'ur', label: 'اردو', flag: '🇵🇰' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' }
];

function cookieDomain() {
  try {
    const host = window.location.hostname;
    if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return '';
    return `;domain=${host}`;
  } catch {
    return '';
  }
}

export function readTranslateTarget() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]+\/([^;]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  return null;
}

function writeGoogTransCookie(target) {
  const value = `/${GT_SOURCE}/${target}`;
  const domain = cookieDomain();
  document.cookie = `googtrans=${value};path=/${domain}`;
  document.cookie = `googtrans=${value};path=/`;
}

export function clearGoogTransCookie() {
  const domain = cookieDomain();
  document.cookie = `googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${domain}`;
  document.cookie = 'googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
}

/** Pin LTR once — never fight Google in a MutationObserver loop. */
export function applyDocumentDir() {
  document.documentElement.dir = 'ltr';
  if (document.body) document.body.dir = 'ltr';
}

/** Default Arabic cookie only — no reload (reload + GT was hanging browsers). */
export function ensureDefaultArabicTranslate() {
  if (typeof document === 'undefined') return;
  if (!readTranslateTarget()) writeGoogTransCookie(GT_DEFAULT);
  applyDocumentDir();
}

export function setTranslateTarget(target, { reload = true } = {}) {
  const code = target || GT_DEFAULT;
  if (code === 'en') {
    clearGoogTransCookie();
    writeGoogTransCookie('en');
  } else {
    writeGoogTransCookie(code);
  }
  applyDocumentDir();
  try {
    localStorage.setItem('iae_gt_lang', code);
  } catch {
    /* ignore */
  }
  if (reload) window.location.reload();
}

let loadStarted = false;

/**
 * Load Google Translate after the page is idle so images/UI can paint first.
 */
export function loadGoogleTranslate() {
  if (typeof window === 'undefined' || loadStarted) return;
  loadStarted = true;

  const start = () => {
    if (document.getElementById('iae-google-translate-script')) {
      maybeInitWidget();
      return;
    }
    window.iaeGoogleTranslateInit = () => {
      maybeInitWidget();
      applyDocumentDir();
    };
    const s = document.createElement('script');
    s.id = 'iae-google-translate-script';
    s.async = true;
    s.defer = true;
    s.src = 'https://translate.google.com/translate_a/element.js?cb=iaeGoogleTranslateInit';
    document.body.appendChild(s);
  };

  // Wait until first paint + a short idle window
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 2500 });
  } else {
    window.setTimeout(start, 1200);
  }
}

function maybeInitWidget() {
  if (!window.google?.translate?.TranslateElement) return;
  const host = document.getElementById('iae_google_translate_element');
  if (!host || host.dataset.ready === '1') return;
  try {
    // eslint-disable-next-line no-new
    new window.google.translate.TranslateElement(
      {
        pageLanguage: GT_SOURCE,
        includedLanguages: GT_LANGS.map((l) => l.code).join(','),
        autoDisplay: false
      },
      'iae_google_translate_element'
    );
    host.dataset.ready = '1';
  } catch (e) {
    console.warn('Google Translate init skipped:', e.message);
  }
  applyDocumentDir();
}
