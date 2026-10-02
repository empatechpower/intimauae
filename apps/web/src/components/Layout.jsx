import { Outlet } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import QuickView from './QuickView';
import AgeGate from './AgeGate';
import CartDrawer from './CartDrawer';
import LangFloat from './LangFloat';
import { GoogleTags, SitePopup, SiteSeo, WhatsAppWidget } from './SiteIntegrations';

export default function Layout() {
  return (
    <>
      <SiteSeo />
      <GoogleTags />
      <SiteHeader />
      <Outlet />
      <SiteFooter />
      <QuickView />
      <CartDrawer />
      <LangFloat />
      <WhatsAppWidget />
      <SitePopup />
      <AgeGate />
    </>
  );
}
