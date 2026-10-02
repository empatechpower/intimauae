/** Catalog amounts are stored in SGD (Uniwebpay charge currency). */
export const STORE_CURRENCY = {
  code: 'SGD',
  symbol: 'S$',
  label: 'SGD',
  flag: '🇸🇬'
};

export const DEFAULT_CURRENCY = 'SGD';
/** Page source language for Google Translate (English). Display default is Arabic via googtrans. */
export const DEFAULT_LANG = 'en';

export const LANGS = [
  { code: 'ar', label: 'العربية', flag: '🇦🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' }
];

/** @deprecated Kept for any leftover imports — storefront is SGD-only. */
export const CURRENCIES = {
  SGD: STORE_CURRENCY
};

const dict = {
  ar: {
    home: 'الرئيسية',
    catalogs: 'الكتالوج',
    fullBody: 'جسم كامل',
    partialBody: 'جسم جزئي',
    trunk: 'الجذع',
    about: 'من نحن',
    contact: 'اتصل بنا',
    cart: 'السلة',
    account: 'حسابي',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    addToCart: 'أضف إلى السلة',
    viewAll: 'عرض الكل',
    blog: 'المدونة',
    shopCollection: 'تسوق المجموعة',
    myOrders: 'طلباتي',
    shippingAddress: 'عنوان الشحن',
    myCoupon: 'قسائمي',
    changePassword: 'تغيير كلمة المرور',
    myMessage: 'رسائلي',
    noOrders: 'لا توجد طلبات !',
    all: 'الكل',
    unpaid: 'غير مدفوع',
    pending: 'قيد المعالجة',
    shipped: 'تم الشحن',
    success: 'ناجح',
    saleBanner: 'تخفيضات الصيف | خصم 15٪ · الرمز: INTIMA15',
    paymentsBy: 'دفع آمن',
    continueShopping: 'متابعة التسوق',
    checkout: 'إتمام الشراء',
    forgotPassword: 'نسيت كلمة المرور',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    fullName: 'الاسم الكامل',
    search: 'بحث',
    cartEmpty: 'سلتك فارغة حالياً.',
    subtotal: 'المجموع الفرعي',
    language: 'اللغة',
    moreLanguages: 'المزيد من اللغات',
    blogPosts: 'مقالات المدونة'
  },
  en: {
    home: 'Home',
    catalogs: 'Catalogs',
    fullBody: 'Full Body',
    partialBody: 'Partial Body',
    trunk: 'Trunk',
    about: 'About',
    contact: 'Contact',
    cart: 'Cart',
    account: 'Account',
    login: 'Log in',
    register: 'Register',
    logout: 'Log out',
    addToCart: 'ADD TO CART',
    viewAll: 'View all',
    blog: 'Blog',
    shopCollection: 'Shop the collection',
    myOrders: 'My Orders',
    shippingAddress: 'Shipping Address',
    myCoupon: 'My Coupon',
    changePassword: 'Change Password',
    myMessage: 'My Message',
    noOrders: 'No orders !',
    all: 'All',
    unpaid: 'Unpaid',
    pending: 'Pending',
    shipped: 'Shipped',
    success: 'Success',
    saleBanner: 'Summer Sale | 15% OFF · Code: INTIMA15',
    paymentsBy: 'Secure checkout',
    continueShopping: 'Continue shopping',
    checkout: 'Checkout',
    forgotPassword: 'Forgot password',
    email: 'Email',
    password: 'Password',
    fullName: 'Full name',
    search: 'Search',
    cartEmpty: 'Your cart is empty.',
    subtotal: 'Subtotal',
    language: 'Language',
    moreLanguages: 'More languages',
    blogPosts: 'Blog posts'
  }
};

export function t(lang, key) {
  return (dict[lang] && dict[lang][key]) || dict.en[key] || key;
}

/** Format catalog price (amounts are SGD). currencyCode ignored — always SGD. */
export function formatMoney(amountSgd) {
  const n = Number(amountSgd || 0);
  return `${STORE_CURRENCY.symbol}${n.toFixed(2)}`;
}

export function formatBlogDate(value, lang = 'en') {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
