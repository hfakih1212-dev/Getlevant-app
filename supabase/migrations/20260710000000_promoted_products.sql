-- Vendor-paid promotion: is_promoted / promotion_expires_at drive priority
-- sorting in the marketplace feed (monetization: programmatic ads +
-- paid vendor promotions).
--
-- These two columns are writable only by the service role. Vendors already
-- own their product rows under "products_vendor_write" (a row-level, not
-- column-level, policy) — without this guard any vendor could grant
-- themselves the paid promotion for free via a normal update/insert call.
-- The intended writer is a payment/entitlement Edge Function running with
-- the service role once billing lands; until then, activate a promotion via
-- the SQL editor or mcp/execute_sql (those connections carry no JWT role
-- claim, so the guard's auth.role() check is null and does not block them).

alter table public.products
  add column if not exists is_promoted boolean not null default false,
  add column if not exists promotion_expires_at timestamptz;

create or replace function public.guard_product_promotion()
returns trigger
language plpgsql
as $$
begin
  -- auth.role() is null for direct/admin connections (no PostgREST JWT),
  -- so IF below is skipped and the write passes through unchanged there.
  -- App traffic always carries a JWT (role = 'authenticated'), which is
  -- <> 'service_role' and so gets reset.
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.is_promoted := false;
      new.promotion_expires_at := null;
    else
      new.is_promoted := old.is_promoted;
      new.promotion_expires_at := old.promotion_expires_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_promotion on public.products;
create trigger products_guard_promotion
  before insert or update on public.products
  for each row execute function public.guard_product_promotion();

-- Feed query floats promoted, still-active rows to the top of each
-- category list; keep that cheap as the catalog grows.
create index if not exists products_promoted_idx
  on public.products (is_promoted, created_at desc)
  where status = 'active';
