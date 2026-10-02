import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { t } from '../lib/i18n';
import { media } from '../lib/media';

export default function SiteFooter() {
  const { lang } = useApp();
  return (
    <footer className="iae-site-footer">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <img src={media('logo-pink.png')} alt="Intimauae" style={{ height: 30, marginBottom: 12 }} />
            <p style={{ color: '#9aa6b2', fontSize: 14, lineHeight: 1.6 }}>
              {lang === 'ar'
                ? 'منتجات الجسم الكامل والجزئي والجذع مع شحن سري من الإمارات.'
                : 'Full Body, Partial Body & Trunk products with discreet UAE shipping.'}
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff' }}>
              {lang === 'ar' ? 'تسوق' : 'Shop'}
            </h4>
            <div style={{ lineHeight: 2, fontSize: 14 }}>
              <Link to="/catalogs" style={{ display: 'block' }}>
                {lang === 'ar' ? 'كل المنتجات' : 'All Products'}
              </Link>
              <Link to="/full-body" style={{ display: 'block' }}>
                {t(lang, 'fullBody')}
              </Link>
              <Link to="/partial-body" style={{ display: 'block' }}>
                {t(lang, 'partialBody')}
              </Link>
              <Link to="/trunk" style={{ display: 'block' }}>
                {t(lang, 'trunk')}
              </Link>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff' }}>
              {lang === 'ar' ? 'مساعدة' : 'Help'}
            </h4>
            <div style={{ lineHeight: 2, fontSize: 14 }}>
              <Link to="/about" style={{ display: 'block' }}>
                {t(lang, 'about')}
              </Link>
              <Link to="/contact" style={{ display: 'block' }}>
                {t(lang, 'contact')}
              </Link>
              <Link to="/faqs" style={{ display: 'block' }}>
                FAQs
              </Link>
              <Link to="/blogs" style={{ display: 'block' }}>
                {t(lang, 'blog')}
              </Link>
              <Link to="/policies/shipping-policy" style={{ display: 'block' }}>
                Shipping Policy
              </Link>
              <Link to="/policies/privacy-policy" style={{ display: 'block' }}>
                Privacy Policy
              </Link>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff' }}>
              {lang === 'ar' ? 'الدفع' : 'Payments'}
            </h4>
            <div className="iae-pay-badge">
              Pay securely with <span>Uniwebpay</span>
            </div>
          </div>
        </div>
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.1)',
            marginTop: 28,
            paddingTop: 14,
            color: '#777',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          <span>© 2026 Intimauae</span>
          <span>{t(lang, 'paymentsBy')}</span>
        </div>
      </div>
    </footer>
  );
}
