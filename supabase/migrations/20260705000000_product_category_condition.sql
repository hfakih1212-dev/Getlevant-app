-- Product classification: clothing category + item condition (brand new / thrifted)
-- Also adds stores.rating for the storefront profile view.

-- ============================================================
-- ENUMS  (no CREATE TYPE IF NOT EXISTS in Postgres — guard via catalog check)
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_category') then
    create type public.product_category as enum (
      'tops',
      'bottoms',
      'dresses',
      'outerwear',
      'accessories',
      'shoes'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_condition') then
    create type public.product_condition as enum (
      'brand_new',
      'thrifted'
    );
  end if;
end $$;

-- ============================================================
-- COLUMNS
-- ============================================================

alter table public.products
  add column if not exists category public.product_category;

alter table public.products
  add column if not exists condition public.product_condition not null default 'brand_new';

-- Feed filters by category — index keeps that cheap as the catalog grows
create index if not exists products_category_idx on public.products (category);

-- Storefront profile shows an aggregate rating once a review system exists;
-- nullable so new stores read as "New" instead of a fake score
alter table public.stores
  add column if not exists rating numeric(2,1) check (rating >= 0 and rating <= 5);

-- ============================================================
-- SEED BACKFILL  (idempotent — only touches known demo rows)
-- ============================================================

update public.products set category = 'dresses',     condition = 'brand_new' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update public.products set category = 'accessories', condition = 'brand_new' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
update public.products set category = 'accessories', condition = 'thrifted'  where id = 'bbbbbbbb-0000-0000-0000-000000000003';
