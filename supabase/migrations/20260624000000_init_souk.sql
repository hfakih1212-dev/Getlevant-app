-- Initial migration for Souk
-- Creates users mirror, orders, sequence, triggers, and RLS examples

create extension if not exists pgcrypto;

-- Public users table (mirror of auth.users)
create table if not exists public.users (
  id uuid primary key,
  email text,
  phone text,
  role text not null default 'shopper',
  store_id uuid,
  created_at timestamptz default now()
);

-- Function to mirror auth.users into public.users on signup
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, phone, role, created_at)
  values (new.id, new.email, new.phone, 'shopper', now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_created on auth.users;
create trigger auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Orders and order_number sequence + trigger
create sequence if not exists public.order_sequence start 1;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  purchaser_id uuid not null references public.users(id),
  store_id uuid not null,
  total_amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null default 'pending',
  metadata jsonb,
  created_at timestamptz default now()
);

create or replace function public.set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := 'SK-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.order_sequence')::text,5,'0');
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_number on public.orders;
create trigger set_order_number
before insert on public.orders
for each row execute function public.set_order_number();

-- Enable RLS and example policies
alter table public.users enable row level security;
alter table public.orders enable row level security;

-- Users: allow users to select/update their own profile, admins can do anything
create policy "users_self_or_admin" on public.users
  for all using (
    (id = auth.uid())
    or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  ) with check (
    (id = auth.uid())
    or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  );

-- Orders: shoppers can create orders for themselves, view their own orders
create policy "orders_shopper_owner" on public.orders
  for select using (
    purchaser_id = auth.uid()
    or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  );

create policy "orders_shopper_insert" on public.orders
  for insert with check (
    purchaser_id = auth.uid()
  );

-- Orders: vendors can view/update orders for their store_id
create policy "orders_vendor_store" on public.orders
  for all using (
    (store_id = (select store_id from public.users where id = auth.uid()))
    or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  ) with check (
    (store_id = (select store_id from public.users where id = auth.uid()))
    or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  );

-- Notes: adjust policies for additional tables (products, stores, inventory, etc.)
