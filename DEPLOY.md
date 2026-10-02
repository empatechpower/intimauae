# Client handoff: Supabase + Vercel

**Printable PDF (detailed click-by-click):**  
[`docs/Intimauae-Client-Handoff-Guide.pdf`](./docs/Intimauae-Client-Handoff-Guide.pdf)

HTML source of the same guide: [`docs/Intimauae-Client-Handoff-Guide.html`](./docs/Intimauae-Client-Handoff-Guide.html)

---

Step-by-step guide to move this store from **your** Supabase to the **client’s** Supabase and host everything on **their** Vercel.

---

## Overview

| Piece | Hosts on |
|--------|----------|
| Storefront (React) | Vercel project **#1** (`apps/web`) |
| API (Express) | Vercel project **#2** (`apps/api`) |
| Database + Auth + Storage | Client’s **Supabase** project |
| Secrets | Vercel **Environment Variables** (never git) |

Pushing code does **not** copy the database. You migrate schema/data separately, then point env vars at the new project.

---

## Part A — Client’s Supabase (new project)

### A1. Create the project
1. Log into [supabase.com](https://supabase.com) with the **client’s** account (or ask them to invite you).
2. **New project** → pick org, name, strong DB password, region (closest to customers).
3. Wait until the project is **Healthy**.

### A2. Copy keys (keep private)
In Supabase → **Project Settings → API**:
- **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
- **anon public** → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (**server only**, never in the web app)

In **Project Settings → Database**:
- **Connection string** → URI  
  - Prefer **Transaction** pooler (`…pooler.supabase.com:6543`) → `DATABASE_URL`  
  - Optional **Direct** (`db.xxxxx.supabase.co:5432`) → `DATABASE_URL_DIRECT`

### A3. Apply the schema
From your laptop (with Supabase CLI logged into the **client** project):

```bash
# Link to client project
npx supabase login
npx supabase link --project-ref YOUR_CLIENT_PROJECT_REF

# Push migrations in this repo
npm run db:migrate
```

Or in the Supabase dashboard → **SQL Editor** → paste and run the contents of:

`supabase/migrations/20260326120000_init.sql`

(and any newer migration files if present).

### A4. Move data from your old project
Pick one:

**Option 1 — Full dump (recommended if you have pg access)**  
1. From **your** old project, dump schema+data (or data only if schema already applied).  
2. Restore into the **client** database (psql / TablePlus / Supabase SQL).

**Option 2 — Re-seed + admin entry**  
1. Empty client DB after schema.  
2. Create admin user in **Authentication → Users** (email/password).  
3. In **Table Editor → profiles**, set that user’s `role` to `admin`.  
4. Re-add products/settings via admin UI, or run:

```bash
# optional helpers (still useful)
npm run seed
node apps/api/scripts/seed-policies.js
```

(Point `apps/api/.env` at the **client** DB first.)

### A5. Auth URLs (so login works on the live site)
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://CLIENT-STORE.vercel.app` (or custom domain)
- **Redirect URLs**: add  
  - `https://CLIENT-STORE.vercel.app/**`  
  - `http://127.0.0.1:5173/**` (local only, optional)

### A6. Storage (if you use product image buckets)
Recreate the same buckets on the client project and re-upload files, or migrate with Supabase storage tools. Update any public URLs in `products` / `product_images` if the host changes.

---

## Part B — Reset / replace secrets (leave your old project behind)

Do this when switching to the client:

1. Stop using your personal `apps/api/.env` / `apps/web/.env` on the client machine.  
2. Create **new** env values only from the **client** Supabase + Uniwebpay.  
3. In Uniwebpay / Checkout dashboard, set **notify / webhook URL** to:  
   `https://CLIENT-API.vercel.app/api/payments/webhook`  
4. Optionally set a long random `UNIWEBPAY_WEBHOOK_SECRET` and send it as header `x-webhook-secret` if your provider supports a custom secret.  
5. Set `ADMIN_DEV_BYPASS=0` (or omit it) in production.  
6. Rotate: DB password, service role key, Uniwebpay private key if they were ever shared in chat/screenshots.

---

## Part C — GitHub (one repo)

1. Push this repo to a GitHub repo the client owns (or transfer ownership).  
2. Confirm `.gitignore` includes `.env` files (it already does).  
3. Never commit real keys.

---

## Part D — Vercel project #1: Storefront (`apps/web`)

1. Log into [vercel.com](https://vercel.com) with the **client** account.  
2. **Add New → Project** → import the GitHub repo.  
3. Configure:
   - **Root Directory**: `apps/web`  
   - **Framework**: Vite  
   - **Build Command**: `npm run build`  
   - **Output Directory**: `dist`  
4. **Environment Variables** (Production + Preview):

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | Client Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Client anon key |
| `VITE_API_URL` | `https://CLIENT-API.vercel.app` (set after API project exists; redeploy web) |
| `VITE_CHECKOUT_FRAMES_PK` | Checkout Frames public key |
| `VITE_DEFAULT_LANG` | `ar` |
| `VITE_DEFAULT_CURRENCY` | `SGD` |

5. Deploy → copy the storefront URL (e.g. `https://intimauae.vercel.app`).  
6. Optional: **Settings → Domains** → add `www.clientdomain.com`.

---

## Part E — Vercel project #2: API (`apps/api`)

1. **Add New → Project** → same GitHub repo again.  
2. Configure:
   - **Root Directory**: `apps/api`  
   - Uses `vercel.json` + `api/index.js` to run Express.  
3. **Environment Variables** (Production):

| Name | Notes |
|------|--------|
| `NODE_ENV` | `production` |
| `APP_URL` | Storefront URL from Part D |
| `API_URL` | This API’s own Vercel URL |
| `CORS_ORIGIN` | Same as `APP_URL` (and custom domain if any) |
| `SUPABASE_URL` | Client project |
| `SUPABASE_ANON_KEY` | Client anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Client service_role |
| `DATABASE_URL` | Pooler connection string |
| `DATABASE_URL_DIRECT` | Optional direct host |
| `ADMIN_DEV_BYPASS` | `0` |
| `UNIWEBPAY_STORE_ID` | From Uniwebpay |
| `UNIWEBPAY_PRIVATE_KEY_PKCS8` | PKCS8 private key |
| `UNIWEBPAY_KEY_VERSION` | Usually `1` |
| `UNIWEBPAY_BASE_URL` | `https://app.uniwebpay.com` |
| `UNIWEBPAY_NOTIFY_URL` | `https://THIS-API.vercel.app/api/payments/webhook` |
| `UNIWEBPAY_WEBHOOK_SECRET` | Optional shared secret |
| `CHECKOUT_FRAMES_PK` | Frames public key |
| `USD_TO_SGD_RATE` | `1` if catalog is already SGD |

4. Deploy → open `https://CLIENT-API.vercel.app/api/health` → should show `"ok": true`.  
5. Go back to **web** project → set `VITE_API_URL` → **Redeploy**.

---

## Part F — Re-authenticate / first admin login

1. On the storefront: open `/register` or create a user in Supabase Auth.  
2. In Supabase → **Table Editor → profiles** → set `role` = `admin` for that user.  
3. Log out / hard refresh → open `/admin`.  
4. Or sign in as the email you treat as bootstrap admin (if still using `admin@intimauae.ae`, create that user in Auth and set role admin).  
5. **Settings → Payments**: paste Uniwebpay keys (fields stay blank after save — secrets are not shown again).  
6. **Settings → Policies / About / Contact**: confirm CMS content.  
7. Test checkout with a small live or sandbox payment.

---

## Part G — Local machine (your laptop after handoff)

When developing against the **client** stack:

1. Copy `apps/api/.env.example` → `apps/api/.env` and fill **client** values.  
2. Copy `apps/web/.env.example` → `apps/web/.env` likewise.  
3. `npm install` from repo root.  
4. `npm run dev` → web `5173`, api `4123`.  
5. Do **not** leave `ADMIN_DEV_BYPASS=1` when testing production-like auth.

---

## Part H — Security checklist (already in this codebase)

- [x] Rate limits (global, payments, contact, webhooks, admin)  
- [x] Security headers (nosniff, frame deny, HSTS in production)  
- [x] CORS locked to `APP_URL` in production  
- [x] Admin bypass disabled in production  
- [x] Payment secrets never returned by admin API (flags only)  
- [x] Webhook rejects unknown transactions; optional webhook secret + Store-Id check  
- [x] User-facing payment errors are generic (details go to Audit)

Still do on the client account:
- Enable Supabase **RLS** (migrations already enable policies).  
- Turn on Vercel **Deployment Protection** for previews if needed.  
- Use HTTPS custom domains only.  
- Rotate keys if this repo was ever shared with secrets in `.env`.

---

## Quick “what to click” summary

1. Client Supabase → New project → copy URL + anon + service_role + DB URI.  
2. Run migrations / restore data → set Auth Site URL.  
3. GitHub → push repo.  
4. Vercel → Project web (`apps/web`) → env → Deploy.  
5. Vercel → Project api (`apps/api`) → env → Deploy.  
6. Set `VITE_API_URL` on web → Redeploy.  
7. Auth user → `profiles.role = admin` → login → configure payments → test order.

If anything fails, check: `/api/health`, browser Network tab for API CORS, and Supabase Auth redirect URLs.
