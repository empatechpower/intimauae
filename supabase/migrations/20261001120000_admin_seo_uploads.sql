-- Product SEO + blog SEO for admin CMS
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
alter table public.products add column if not exists seo_keywords text;
alter table public.products add column if not exists slug_canonical text;

alter table public.blog_posts add column if not exists seo_title text;
alter table public.blog_posts add column if not exists seo_description text;
alter table public.blog_posts add column if not exists seo_keywords text;
