import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import cors from 'cors';
import express from 'express';
import { catalogRouter } from './routes/catalog.js';
import { ordersRouter } from './routes/orders.js';
import { paymentsRouter } from './routes/payments.js';
import { adminRouter } from './routes/admin.js';
import { blogRouter } from './routes/blog.js';
import { settingsPublicRouter } from './routes/settingsPublic.js';
import { contactRouter } from './routes/contact.js';
import { loadPaymentConfigFromDb } from './lib/paymentConfig.js';
import {
  securityHeaders,
  globalRateLimit,
  paymentRateLimit,
  contactRateLimit,
  webhookRateLimit,
  adminWriteRateLimit,
  authSensitiveRateLimit
} from './lib/security.js';

const app = express();
const PORT = Number(process.env.PORT || 4123);
const isProd = process.env.NODE_ENV === 'production';

const allowedOrigins = [
  process.env.APP_URL,
  process.env.CORS_ORIGIN,
  'https://intimauae.ae',
  'https://www.intimauae.ae',
  'http://127.0.0.1:5173',
  'http://localhost:5173'
]
  .filter(Boolean)
  .flatMap((o) => String(o).split(',').map((s) => s.trim()))
  .filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true;
  if (!isProd) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Allow Vercel preview / production frontends for this project
  try {
    const host = new URL(origin).hostname;
    if (host === 'intimauae.ae' || host === 'www.intimauae.ae') return true;
    if (host.endsWith('.vercel.app') && host.includes('intimauae')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(globalRateLimit);
app.use(
  cors({
    origin(origin, cb) {
      // Never throw — throwing skips CORS headers and looks like a NetworkError in the browser
      return cb(null, originAllowed(origin));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'intimauae-api',
    env: isProd ? 'production' : 'development',
    supabase: Boolean(process.env.SUPABASE_URL),
    database: Boolean(process.env.DATABASE_URL)
  });
});

app.use('/api/catalog', catalogRouter);
app.use('/api/blog', blogRouter);
// Lazy-mount auth so Firebase Admin is never loaded for catalog/admin cold starts
app.use('/api/auth', authSensitiveRateLimit, async (req, res, next) => {
  try {
    const { authRouter } = await import('./routes/auth.js');
    return authRouter(req, res, next);
  } catch (err) {
    next(err);
  }
});
app.use('/api/orders', ordersRouter);
app.use('/api/payments/webhook', webhookRateLimit);
app.use('/api/payments', paymentRateLimit, paymentsRouter);
app.use('/api/admin', adminWriteRateLimit, adminRouter);
app.use('/api/settings', settingsPublicRouter);
app.use('/api/contact', contactRateLimit, contactRouter);

app.use(async (err, req, res, _next) => {
  console.error(err);
  const status = err.status || (err.message === 'Not allowed by CORS' ? 403 : 500);
  if (status >= 500) {
    try {
      const { writeAudit } = await import('./lib/audit.js');
      await writeAudit({
        level: 'error',
        source: 'api',
        event: 'unhandled_error',
        message: err.message || 'Server error',
        detail: {
          path: req.originalUrl || req.url,
          method: req.method,
          stack: err.stack || null
        }
      });
    } catch {
      /* ignore audit failures */
    }
  }
  const message =
    status >= 500
      ? 'Something went wrong. Please try again.'
      : err.message || 'Request failed';
  res.status(status).json({ error: message });
});

export { app, PORT };

if (process.env.VERCEL !== '1') {
  loadPaymentConfigFromDb().finally(() => {
    const host = process.env.LISTEN_HOST || (isProd ? '0.0.0.0' : '127.0.0.1');
    app.listen(PORT, host, () => {
      console.log(`Intimauae API http://${host}:${PORT}`);
    });
  });
} else {
  loadPaymentConfigFromDb().catch((e) => console.warn('payment config load', e.message));
}

export default app;
