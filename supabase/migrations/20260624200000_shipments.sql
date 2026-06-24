-- Shipment tracking layer: whatsapp_sent flag on orders, shipments table,
-- and shipment_events append-only feed. RLS scoped to shopper/vendor/admin.

-- ============================================================
-- PATCH ORDERS
-- ============================================================

alter table public.orders
  add column if not exists whatsapp_sent boolean not null default false;

-- ============================================================
-- ENUMS
-- ============================================================

create type public.courier_type as enum (
  'aramex',
  'dhl',
  'fedex',
  'tnt',
  'local_courier',
  'internal',
  'other'
);

create type public.shipment_status as enum (
  'pending',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed',
  'returned'
);

-- ============================================================
-- TABLES
-- ============================================================

create table public.shipments (
  id            uuid                   primary key default gen_random_uuid(),
  order_id      uuid                   not null references public.orders(id) on delete cascade,
  courier_name  text                   not null,
  courier_phone text,
  tracking_id   text,
  courier_type  public.courier_type    not null,
  status        public.shipment_status not null default 'pending',
  webhook_data  jsonb,
  created_at    timestamptz            default now(),
  updated_at    timestamptz            default now()
);

create trigger shipments_updated_at
before update on public.shipments
for each row execute function public.touch_updated_at();

-- Append-only feed; one row per status transition or courier webhook push
create table public.shipment_events (
  id           uuid        primary key default gen_random_uuid(),
  shipment_id  uuid        not null references public.shipments(id) on delete cascade,
  event_type   text        not null,
  description  text,
  location     text,
  occurred_at  timestamptz not null default now(),
  raw_payload  jsonb,
  created_at   timestamptz default now()
);

-- ============================================================
-- RLS — shipments
-- ============================================================

alter table public.shipments       enable row level security;
alter table public.shipment_events enable row level security;

-- Shoppers: read shipments for their own orders
create policy "shipments_shopper_select" on public.shipments
  for select using (
    exists (
      select 1 from public.orders
      where id = order_id and shopper_id = auth.uid()
    )
  );

-- Vendors: read shipments for their store's orders
create policy "shipments_vendor_select" on public.shipments
  for select using (
    exists (
      select 1 from public.orders
      where id = order_id and public.owns_store(store_id)
    )
  );

-- Vendors: create shipments for their store's orders
create policy "shipments_vendor_insert" on public.shipments
  for insert with check (
    exists (
      select 1 from public.orders
      where id = order_id and public.owns_store(store_id)
    )
  );

-- Vendors: update (status, tracking_id, webhook_data) for their store's shipments
create policy "shipments_vendor_update" on public.shipments
  for update
  using (
    exists (
      select 1 from public.orders
      where id = order_id and public.owns_store(store_id)
    )
  )
  with check (
    exists (
      select 1 from public.orders
      where id = order_id and public.owns_store(store_id)
    )
  );

-- Admins: full access
create policy "shipments_admin_all" on public.shipments
  for all
  using     (public.current_user_role() = 'admin')
  with check(public.current_user_role() = 'admin');

-- ============================================================
-- RLS — shipment_events
-- ============================================================

-- Shoppers: read events for their own orders' shipments
create policy "shipment_events_shopper_select" on public.shipment_events
  for select using (
    exists (
      select 1
      from   public.shipments s
      join   public.orders    o on o.id = s.order_id
      where  s.id = shipment_id
        and  o.shopper_id = auth.uid()
    )
  );

-- Vendors: read events for their store's shipments
create policy "shipment_events_vendor_select" on public.shipment_events
  for select using (
    exists (
      select 1
      from   public.shipments s
      join   public.orders    o on o.id = s.order_id
      where  s.id = shipment_id
        and  public.owns_store(o.store_id)
    )
  );

-- Vendors: append events for their store's shipments (courier webhooks, manual pushes)
create policy "shipment_events_vendor_insert" on public.shipment_events
  for insert with check (
    exists (
      select 1
      from   public.shipments s
      join   public.orders    o on o.id = s.order_id
      where  s.id = shipment_id
        and  public.owns_store(o.store_id)
    )
  );

-- Admins: full access
create policy "shipment_events_admin_all" on public.shipment_events
  for all
  using     (public.current_user_role() = 'admin')
  with check(public.current_user_role() = 'admin');
