# Intimauae API & Uniwebpay

Base URL (local): `http://127.0.0.1:4123`

Storefront displays prices in **USD**. Uniwebpay charges in **SGD cents**. Secrets stay on the API only — never in the browser.

## Env (`apps/api/.env`)

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `4123`) |
| `APP_URL` | Storefront origin for CORS + return URLs |
| `API_URL` | Public API origin (webhook notify URL) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Browser-safe key (also used for user JWT verify) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional admin writes via Supabase client |
| `DATABASE_URL` | Postgres pooler URL (preferred for writes when service role is empty) |
| `UNIWEBPAY_BASE_URL` | Default `https://app.uniwebpay.com` |
| `UNIWEBPAY_STORE_ID` | Store id header |
| `UNIWEBPAY_PRIVATE_KEY_PKCS8` | PKCS#8 RSA private key (PEM or single-line base64) |
| `UNIWEBPAY_KEY_VERSION` | Signature key version (default `1`) |
| `UNIWEBPAY_NOTIFY_URL` | Override webhook URL |
| `CHECKOUT_FRAMES_PK` | Checkout.com Frames public key for card tokenization |
| `USD_TO_SGD_RATE` | USD → SGD (default `1.35`). `AED_TO_SGD_RATE` still accepted as alias |

## Health

`GET /api/health`

```json
{ "ok": true, "service": "intimauae-api", "defaults": { "lang": "ar", "currency": "USD" } }
```

## Catalog

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/catalog/products` | Optional `?category=full-body\|partial-body\|trunk` |
| GET | `/api/catalog/products/:handle` | Single product |
| GET | `/api/blog/posts` | Blog list |
| GET | `/api/blog/posts/:slug` | Blog post |

Auth header (account / admin / pay): `Authorization: Bearer <supabase_access_token>`

## Orders

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| GET | `/api/orders/mine` | required | `?status=` optional |
| POST | `/api/orders` | optional (guest ok) | `{ items, shipping, email, coupon? }` |

Order totals are stored from catalog USD amounts (`total_aed` column name is legacy; values are USD). Charge amount is converted to SGD cents at pay time.

## Payments (Uniwebpay)

### Config

`GET /api/payments/config`

```json
{
  "checkoutFramesPk": "pk_…",
  "currency": "SGD",
  "displayCurrency": "USD",
  "storeId": "…",
  "ready": false
}
```

### Create payment

`POST /api/payments/create`

```json
{
  "orderId": "uuid",
  "cardToken": "tok_…",
  "successUrl": "https://store/checkout?status=success",
  "failUrl": "https://store/checkout?status=fail"
}
```

Flow:

1. Load order → amount = `charge_sgd_cents` or `usd * USD_TO_SGD_RATE * 100`.
2. Build sorted JSON body for Uniwebpay `/api/v1/payment/pay`.
3. Persist pending row in `payments`.
4. If private key + Frames pk + `cardToken` missing → return **draft** mode (no live charge).
5. Else sign and POST to Uniwebpay.

Request body sent to Uniwebpay:

```json
{
  "acquirerType": "CHECK_OUTPAY",
  "amount": 12345,
  "cardToken": "tok_…",
  "checkoutPaymentType": "REGULAR",
  "clientTransactionId": 1720…,
  "currency": "SGD",
  "failUrl": "…",
  "notificationUrl": "https://api…/api/payments/webhook",
  "successUrl": "…"
}
```

`amount` is **integer SGD cents**.

### Signature (RSA-SHA256)

Content to sign:

```text
POST /api/v1/payment/pay
<StoreId>.<RequestTime>.<sortedJsonBody>
```

`Request-Time` format: ISO-8601 with `+00:00` (no millis), e.g. `2026-03-26T12:00:00+00:00`.

Headers:

```http
Content-Type: application/json
Store-Id: <storeId>
Request-Time: <requestTime>
Signature: algorithm=RSA256, keyVersion=1, signature=<urlEncodedBase64Sig>
```

Implementation: `apps/api/src/lib/uniwebpay.js` → `signUniwebpayRequest`, `sortedJson`, `uniwebHeaders`.

### Query

`POST /api/payments/query`

```json
{ "clientTransactionId": "1720…" }
```

Proxies to Uniwebpay `POST /api/v1/payment/query` with the same signing rules.

### Webhook

`POST /api/payments/webhook`

Receives Uniwebpay / acquirer notification. Updates `payments.status` and, on success, sets related order to `pending`.

Configure Uniwebpay notify URL to:

`{API_URL}/api/payments/webhook`

## Admin

All under `/api/admin/*` — requires authenticated user with `is_admin` (or role) in profiles.

Typical resources: products, orders, customers, discounts, warehouses, CMS/settings.

## Card capture (browser)

Do **not** collect card PAN/CVV on the storefront. Uniwebpay hosts the card form (hosted checkout redirect and/or Frames when keys are live). Storefront creates the order + payment session, then redirects when Uniwebpay returns a checkout URL.

Never send Uniwebpay private keys to the browser.

## Local smoke

```bash
npm run dev
curl http://127.0.0.1:4123/api/health
curl http://127.0.0.1:4123/api/catalog/products
curl http://127.0.0.1:4123/api/payments/config
```
