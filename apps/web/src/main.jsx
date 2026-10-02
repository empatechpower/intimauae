import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureDefaultArabicTranslate } from './lib/googleTranslate';
import App from './App.jsx';

// Storefront only — Google Translate defaults the whole site to Arabic
if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
  ensureDefaultArabicTranslate();
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
