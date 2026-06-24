-- Order tables: replaces the scaffold orders table from migration 001
-- with properly typed columns, order_items, stock trigger, and tight RLS.

-- ============================================================
-- REPLACE SCAFFOLD ORDERS TABLE
-- Drop cascade removes its triggers, policies, and FK constraints.
-- order_sequence and set_order_number() function are NOT table-owned
-- and survive the drop — we reuse them below.
-- ============================================================

drop table if exists public.orders cascade;

-- ============================================================
-- ENUMS
-- ============================================================

create type public.order_status as enum (
  'placed',
  'confirmed',
  'preparing',
  'ready',
  'dispatched',
  'delivered',
  'cancelled'
);

create type public.payment_method as enum (
  'whatsapp',
  'cash_on_delivery',
  'bank_transfer'
);

create type public.payment_status as enum (
  'pending',
  'paid',
  'failed',
  'refunded'
);

-- ============================================================
-- TABLES
-- ============================================================

create table public.orders (
  id               uuid                  primary key default gen_random_uuid(),
  order_number     text                  unique,
  shopper_id       uuid                  not null references public.users(id),
  store_id         uuid                  not null references public.stores(id),
  status           public.order_status   not null default 'placed',
  payment_method   public.payment_method not null,
  payment_status   public.payment_status not null default 'pending',
  delivery_address text,
  subtotal_usd     numeric(12,2)         not null,
  delivery_fee_usd numeric(12,2)         not null default 0,
  total_usd        numeric(12,2)         not null,
  notes            text,
  created_at       timestamptz           default now(),
  updated_at       timestamptz           default now()
);

-- Re-attach the SK-YYYY-NNNNN order_number trigger (function defined in migration 001)
create trigger set_order_number
before insert on public.orders
for each row execute function public.set_order_number();

-- Keep updated_at current whenever a vendor changes order status
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------

create table public.order_items (
  id             uuid          primary key default gen_random_uuid(),
  order_id       uuid          not null references public.orders(id) on delete cascade,
  product_id     uuid          not null references public.products(id),
  variant_id     uuid          not null references public.product_variants(id),
  quantity       integer       not null check (quantity > 0),
  unit_price_usd numeric(12,2) not null,   -- snapshot at checkout; immune to future price changes
  created_at     timestamptz   default now()
);

-- ============================================================
-- STOCK DECREMENT TRIGGER
-- Runs BEFORE INSERT on order_items.
-- SELECT FOR UPDATE serialises concurrent inserts for the same
-- variant, preventing overselling under high concurrency.
-- ============================================================

create or replace function public.decrement_variant_stock()
returns trigger language plpgsql as $$
declare
  available integer;
begin
  select stock
  into   available
  from   public.product_variants
  where  id = new.variant_id
  for update;

  if available < new.quantity then
    raise exception
      'Insufficient stock for variant %. Available: %, requested: %.',
      new.variant_id, available, new.quantity
      using errcode = 'P0001';
  end if;

  update public.product_variants
  set    stock = stock - new.quantity
  where  id = new.variant_id;

  return new;
end;
$$;

create trigger decrement_stock_on_order_item
before insert on public.order_items
for each row execute function public.decrement_variant_stock();

-- ============================================================
-- RLS
-- ============================================================

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- ---- orders ----

-- Shoppers read their own orders
create policy "orders_shopper_select" on public.orders
  for select using (shopper_id = auth.uid());

-- Shoppers create orders for themselves
create policy "orders_shopper_insert" on public.orders
  for insert with check (shopper_id = auth.uid());

-- Vendors read all orders placed with their store
create policy "orders_vendor_select" on public.orders
  for select using (public.owns_store(store_id));

-- Vendors update status / notes on their store's orders (not financial fields)
create policy "orders_vendor_update" on public.orders
  for update
  using     (public.owns_store(store_id))
  with check (public.owns_store(store_id));

-- ---- order_items ----

-- Shoppers read line items on their own orders
create policy "order_items_shopper_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      where id = order_id and shopper_id = auth.uid()
    )
  );

-- Shoppers insert line items into their own orders
create policy "order_items_shopper_insert" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders
      where id = order_id and shopper_id = auth.uid()
    )
  );

-- Vendors read line items for their store's orders
create policy "order_items_vendor_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      where id = order_id and public.owns_store(store_id)
    )
  );
