-- Vendor-initiated "Promoted" placement requests. Payment settles
-- off-platform (WhatsApp), consistent with checkout: the vendor files a
-- request in-app, the Souk team contacts them on their store WhatsApp to
-- arrange payment, then approves with the helper below. Approval is the
-- only path that flips products.is_promoted — the products_guard_promotion
-- trigger still blocks any client-side write of the promotion columns.

create table if not exists public.promotion_requests (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  store_id      uuid not null references public.stores(id) on delete cascade,
  requested_by  uuid not null references public.users(id),
  duration_days integer not null check (duration_days in (7, 30)),
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

-- One open request per product — a second tap can't queue duplicates
create unique index if not exists promotion_requests_one_pending
  on public.promotion_requests (product_id)
  where status = 'pending';

alter table public.promotion_requests enable row level security;

-- Vendors see their own store's requests
create policy "promotion_requests_vendor_select" on public.promotion_requests
  for select
  using (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

-- Vendors file requests only for products of a store they own, as themselves
create policy "promotion_requests_vendor_insert" on public.promotion_requests
  for insert
  with check (
    requested_by = auth.uid()
    and store_id in (select id from public.stores where owner_id = auth.uid())
    and product_id in (select id from public.products where products.store_id = promotion_requests.store_id)
  );

-- No vendor update/delete policies: decisions are admin-only (see below).

-- ============================================================
-- ADMIN DECISION HELPERS
-- Run from the SQL editor / service role only — execute is revoked from
-- every app-facing role, so authenticated clients can't call these.
-- ============================================================

create or replace function public.approve_promotion_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.promotion_requests%rowtype;
begin
  select * into req
  from public.promotion_requests
  where id = p_request_id and status = 'pending'
  for update;

  if req.id is null then
    raise exception 'No pending promotion request with id %', p_request_id;
  end if;

  -- Extend from the current expiry when the product is already promoted,
  -- so back-to-back purchases stack instead of overlapping.
  update public.products
  set is_promoted = true,
      promotion_expires_at =
        greatest(coalesce(promotion_expires_at, now()), now())
        + make_interval(days => req.duration_days)
  where id = req.product_id;

  update public.promotion_requests
  set status = 'approved', decided_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.reject_promotion_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.promotion_requests
  set status = 'rejected', decided_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'No pending promotion request with id %', p_request_id;
  end if;
end;
$$;

revoke execute on function public.approve_promotion_request(uuid) from public, anon, authenticated;
revoke execute on function public.reject_promotion_request(uuid)  from public, anon, authenticated;
