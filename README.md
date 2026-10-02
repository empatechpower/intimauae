# Intimauae — React + Node + Supabase

Clean monorepo (legacy static HTML removed). Catalog, images, blog, orders, and admin are on Supabase.

## Run

```bash
npm install
npm run dev
```

- Storefront: http://127.0.0.1:5173
- Admin: http://127.0.0.1:5173/admin
- API: http://127.0.0.1:4123

Admin credentials: see `ADMIN_CREDENTIALS.txt` (gitignored).

## Bootstrap Supabase (one-time)

```bash
npm run bootstrap
```

Seeds products/blog, uploads images to Storage bucket `catalog`, creates admin user.

## API docs

See [docs/API.md](docs/API.md) for catalog, orders, and Uniwebpay payment signing / webhook reference.

Storefront prices display in **USD** by default.
