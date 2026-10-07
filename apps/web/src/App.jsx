import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import { LoginPage, RegisterPage, ForgotPasswordPage } from './pages/AuthPages';
import AccountRoutes from './pages/AccountPages';
import AdminRoutes from './pages/AdminPages';
import {
  AboutPage,
  ContactPage,
  FaqsPage,
  BlogListPage,
  BlogPostPage,
  PolicyPage
} from './pages/StaticPages';
import './styles.css';

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="catalogs" element={<CatalogPage />} />
              <Route path="full-body" element={<CatalogPage />} />
              <Route path="partial-body" element={<CatalogPage />} />
              <Route path="trunk" element={<CatalogPage />} />
              <Route path="products/:handle" element={<ProductPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="faqs" element={<FaqsPage />} />
              <Route path="blogs" element={<BlogListPage />} />
              <Route path="blogs/:handle" element={<BlogPostPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="policies/privacy-policy" element={<PolicyPage settingKey="page_privacy_policy" fallbackTitle="Privacy Policy" />} />
              <Route path="policies/refund-policy" element={<PolicyPage settingKey="page_refund_policy" fallbackTitle="Refund Policy" />} />
              <Route path="policies/shipping-policy" element={<PolicyPage settingKey="page_shipping_policy" fallbackTitle="Shipping Policy" />} />
              <Route path="account/*" element={<AccountRoutes />} />
            </Route>
            <Route path="admin/*" element={<AdminRoutes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
