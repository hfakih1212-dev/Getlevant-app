-- Growth features: favorites, store logos, referral redemption, and
-- server-authoritative voucher redemption at checkout.

-- ============================================================
-- FAVORITES
-- ============================================================

create table if not exists public.favorites (
  user_id    uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, product_id)
);

alter table public.favorites enable row level security;

create policy "favorites_owner_all" on public.favorites
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- STORE LOGO
-- ============================================================

alter table public.stores
  add column if not exists logo_url text;

-- ============================================================
-- REFERRAL REDEMPTION
-- A new shopper enters a friend's code before their first completed
-- order; when that first order is delivered, both sides get a voucher.
-- ============================================================

alter table public.users
  add column if not exists referred_by uuid references public.users(id);

create or replace function public.redeem_referral(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
begin
  select id into v_referrer
  from public.users
  where referral_code = upper(trim(p_code));

  if v_referrer is null then
    raise exception 'That referral code doesn''t exist.';
  end if;
  if v_referrer = auth.uid() then
    raise exception 'You can''t redeem your own referral code.';
  end if;

  update public.users
  set referred_by = v_referrer
  where id = auth.uid()
    and referred_by is null
    and completed_orders_count = 0;

  if not found then
    raise exception 'Referral codes can only be used once, before your first completed order.';
  end if;
end;
$$;

revoke execute on function public.redeem_referral(text) from public, anon;
grant  execute on function public.redeem_referral(text) to authenticated;

-- ============================================================
-- VOUCHER REDEMPTION AT CHECKOUT
-- Client sends voucher_code only; this trigger does the authoritative
-- validation and discount math so totals can't be forged, and burns the
-- voucher atomically (FOR UPDATE guards double-spend).
-- ============================================================

alter table public.orders
  add column if not exists voucher_code text,
  add column if not exists discount_usd numeric(12,2) not null default 0;

create or replace function public.apply_order_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rewards%rowtype;
begin
  -- Zero any client-supplied discount; only a valid voucher sets it
  new.discount_usd := 0;

  if new.voucher_code is null then
    new.total_usd := new.subtotal_usd + new.delivery_fee_usd;
    return new;
  end if;

  select * into r
  from public.rewards
  where code = new.voucher_code
    and user_id = new.shopper_id
    and status = 'active'
  for update;

  if r.id is null then
    raise exception 'Invalid or already-used voucher code.' using errcode = 'P0002';
  end if;

  new.discount_usd := round(new.subtotal_usd * r.discount_pct / 100.0, 2);
  new.total_usd    := new.subtotal_usd + new.delivery_fee_usd - new.discount_usd;

  update public.rewards set status = 'redeemed' where id = r.id;

  return new;
end;
$$;

drop trigger if exists orders_apply_voucher on public.orders;
create trigger orders_apply_voucher
  before insert on public.orders
  for each row execute function public.apply_order_voucher();

-- ============================================================
-- REFERRAL PAYOFF — extend the delivered-order hook: on a shopper's
-- FIRST delivered order, mint a 10% voucher for both referrer and
-- referred (milestone 0 marks referral vouchers).
-- ============================================================

create or replace function public.handle_order_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  v_referrer uuid;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    update public.users
    set completed_orders_count = completed_orders_count + 1
    where id = new.shopper_id
    returning completed_orders_count into new_count;

    if new_count in (5, 10) then
      insert into public.rewards (user_id, code, milestone, discount_pct)
      values (
        new.shopper_id,
        'SOUK-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)),
        new_count,
        case when new_count >= 10 then 20 else 10 end
      );
    end if;

    if new_count = 1 then
      select referred_by into v_referrer
      from public.users where id = new.shopper_id;

      if v_referrer is not null then
        insert into public.rewards (user_id, code, milestone, discount_pct)
        values
          (v_referrer,      'SOUK-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)), 0, 10),
          (new.shopper_id,  'SOUK-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)), 0, 10);
      end if;
    end if;
  end if;
  return new;
end;
$$;
