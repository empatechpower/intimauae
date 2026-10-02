-- Intimauae initial schema
create extension if not exists "pgcrypto";

create type public.user_role as enum ('customer', 'admin');
create type public.order_status as enum ('unpaid', 'pending', 'shipped', 'success', 'cancelled');
create type public.payment_status as enum ('created', 'pending', 'paid', 'failed', 'refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role public.user_role not null default 'customer',
  preferred_lang text not null default 'ar',
  preferred_currency text not null default 'AED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id text primary key,
  name_en text not null,
  name_ar text,
  slug text not null unique,
  sort_order int not null default 0
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  country text default 'AE',
  active boolean not null default true
);

create table public.products (
  id bigint primary key,
  handle text not null unique,
  title text not null,
  title_ar text,
  vendor text default 'Intimauae',
  category_id text references public.categories(id),
  subcategory text,
  warehouse text default 'UAE Warehouse',
  price_aed numeric(12,2) not null,
  compare_at_aed numeric(12,2),
  description text,
  description_ar text,
  height text,
  material text,
  skeleton text,
  rating numeric(3,2) default 4.8,
  reviews_count int default 0,
  tags text[] default '{}',
  stock int not null default 50,
  is_clearance boolean default false,
  is_popular boolean default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  url text not null,
  sort_order int not null default 0
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text default 'Home',
  full_name text,
  phone text,
  line1 text not null,
  line2 text,
  city text,
  state text,
  postal_code text,
  country text default 'AE',
  is_default boolean default false,
  created_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_off numeric(5,2),
  amount_off_aed numeric(12,2),
  active boolean default true,
  starts_at timestamptz,
  ends_at timestamptz
);

create table public.user_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  claimed_at timestamptz default now(),
  unique(user_id, coupon_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  status public.order_status not null default 'unpaid',
  currency_display text not null default 'AED',
  subtotal_aed numeric(12,2) not null default 0,
  total_aed numeric(12,2) not null default 0,
  charge_sgd_cents bigint,
  shipping_address jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  handle text,
  title text not null,
  image text,
  unit_price_aed numeric(12,2) not null,
  qty int not null default 1
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  client_transaction_id text not null unique,
  provider text not null default 'uniwebpay',
  status public.payment_status not null default 'created',
  amount_sgd_cents bigint,
  card_token text,
  provider_payload jsonb,
  raw_webhook jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text,
  body text not null,
  is_read boolean default false,
  created_at timestamptz not null default now()
);

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  title text not null,
  title_ar text,
  excerpt text,
  body jsonb not null default '[]',
  image text,
  published_at date,
  active boolean default true
);

create table public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text,
  updated_at timestamptz default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

insert into public.categories (id, name_en, name_ar, slug, sort_order) values
  ('full-body', 'Full Body Products', 'منتجات الجسم الكامل', 'full-body', 1),
  ('partial-body', 'Partial Body Products', 'منتجات الجسم الجزئي', 'partial-body', 2),
  ('trunk', 'Trunk', 'الجذع', 'trunk', 3);

insert into public.warehouses (name, code, country) values
  ('UAE Warehouse', 'UAE', 'AE');

insert into public.settings (key, value) values
  ('aed_to_sgd_rate', '0.37'::jsonb),
  ('default_lang', '"ar"'::jsonb),
  ('default_currency', '"AED"'::jsonb),
  ('uniwebpay_store_id', '"1551614759571685376"'::jsonb);

insert into public.coupons (code, percent_off, active) values
  ('INTIMA15', 15, true);

-- Profile auto-create on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, preferred_lang, preferred_currency)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'customer',
    'ar',
    'AED'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.categories enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.blog_posts enable row level security;
alter table public.cms_pages enable row level security;
alter table public.coupons enable row level security;
alter table public.user_coupons enable row level security;
alter table public.warehouses enable row level security;
alter table public.settings enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create policy "Public read products" on public.products for select using (active = true or public.is_admin());
create policy "Admin write products" on public.products for all using (public.is_admin());
create policy "Public read images" on public.product_images for select using (true);
create policy "Admin write images" on public.product_images for all using (public.is_admin());
create policy "Public read categories" on public.categories for select using (true);
create policy "Public read blogs" on public.blog_posts for select using (active = true or public.is_admin());
create policy "Admin write blogs" on public.blog_posts for all using (public.is_admin());
create policy "Public read cms" on public.cms_pages for select using (true);
create policy "Admin write cms" on public.cms_pages for all using (public.is_admin());
create policy "Public read warehouses" on public.warehouses for select using (true);
create policy "Public read coupons" on public.coupons for select using (active = true or public.is_admin());
create policy "Public read settings" on public.settings for select using (true);
create policy "Admin write settings" on public.settings for all using (public.is_admin());

create policy "Profiles self read" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "Profiles self update" on public.profiles for update using (auth.uid() = id or public.is_admin());

create policy "Addresses own" on public.addresses for all using (auth.uid() = user_id or public.is_admin());
create policy "Orders own read" on public.orders for select using (auth.uid() = user_id or public.is_admin());
create policy "Orders own insert" on public.orders for insert with check (auth.uid() = user_id or user_id is null or public.is_admin());
create policy "Orders admin update" on public.orders for update using (public.is_admin() or auth.uid() = user_id);
create policy "Order items via order" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);
create policy "Order items insert" on public.order_items for insert with check (true);
create policy "Payments own read" on public.payments for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);
create policy "Payments service insert" on public.payments for insert with check (true);
create policy "Payments service update" on public.payments for update using (true);
create policy "Messages own" on public.messages for all using (auth.uid() = user_id or public.is_admin());
create policy "User coupons own" on public.user_coupons for all using (auth.uid() = user_id or public.is_admin());
