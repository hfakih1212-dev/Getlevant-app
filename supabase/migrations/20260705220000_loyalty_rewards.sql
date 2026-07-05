-- Customer loyalty: shopper tier counters, referral codes, reward vouchers,
-- and the delivered-order hook that drives them.

-- ============================================================
-- USERS: loyalty columns
-- ============================================================

alter table public.users
  add column if not exists completed_orders_count integer not null default 0,
  add column if not exists referral_code text;

-- Backfill referral codes for existing users, then default for new rows
update public.users
set referral_code = upper(substr(md5(id::text || gen_random_uuid()::text), 1, 8))
where referral_code is null;

alter table public.users
  alter column referral_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));

create unique index if not exists users_referral_code_key on public.users (referral_code);

-- Backfill order counts from delivery history
update public.users u
set completed_orders_count = sub.cnt
from (
  select shopper_id, count(*) as cnt
  from public.orders
  where status = 'delivered'
  group by shopper_id
) sub
where u.id = sub.shopper_id;

-- The users_self_update RLS policy allows writing any column of one's own
-- row; column-level grants stop shoppers from inflating their own loyalty
-- counter or rewriting their referral code. Client code only ever updates
-- the three columns granted below (role/store_id go through definer RPCs).
revoke update on table public.users from authenticated, anon;
grant update (phone, notification_prefs, push_token) on table public.users to authenticated;

-- ============================================================
-- REWARDS
-- ============================================================

create table if not exists public.rewards (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    not null references public.users(id) on delete cascade,
  code         text    not null unique,
  milestone    integer not null,
  discount_pct integer not null,
  status       text    not null default 'active',   -- active | redeemed | expired
  seen         boolean not null default false,      -- drives the one-time celebration pop-up
  created_at   timestamptz default now()
);

alter table public.rewards enable row level security;

create policy "rewards_owner_select" on public.rewards
  for select using (user_id = auth.uid());

-- Owners may flip seen/redeem their own vouchers; there is no insert policy —
-- rewards are minted only by the delivered-order trigger (definer bypasses RLS)
create policy "rewards_owner_update" on public.rewards
  for update
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- ORDER COMPLETION HOOK
-- On the placed→…→delivered transition, bump the buyer's counter; at the
-- 5 and 10 milestones mint a discount voucher for them.
-- ============================================================

create or replace function public.handle_order_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
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
  end if;
  return new;
end;
$$;

drop trigger if exists orders_delivered_loyalty on public.orders;
create trigger orders_delivered_loyalty
  after update of status on public.orders
  for each row execute function public.handle_order_delivered();
