/**
 * Lightweight security helpers — no extra npm deps.
 * Rate limits, security headers, IP helpers.
 */

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Sliding window counter per key */
function createRateLimiter({ windowMs, max, name = 'rate' }) {
  const hits = new Map();

  function prune(now) {
    for (const [k, v] of hits) {
      if (now - v.start > windowMs) hits.delete(k);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) prune(now);
    const key = `${name}:${clientIp(req)}`;
    let entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/** Global API abuse guard */
export const globalRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_GLOBAL || 180),
  name: 'global'
});

/** Login / auth-adjacent (contact, orders create, payments) */
export const authSensitiveRateLimit = createRateLimiter({
  windowMs: 15 * 60_000,
  max: Number(process.env.RATE_LIMIT_AUTH || 40),
  name: 'auth'
});

export const paymentRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_PAYMENT || 20),
  name: 'pay'
});

export const contactRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_CONTACT || 8),
  name: 'contact'
});

export const webhookRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_WEBHOOK || 120),
  name: 'webhook'
});

export const adminWriteRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_ADMIN || 90),
  name: 'admin'
});

export { clientIp, createRateLimiter };
