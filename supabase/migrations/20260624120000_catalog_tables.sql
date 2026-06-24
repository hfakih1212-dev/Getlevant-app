-- Catalog tables: stores, products, product_variants, product_images
-- Includes RLS policies and Lebanese boutique seed data

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.stores (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.users(id) on delete cascade,
  name        text        not null,
  description text,
  whatsapp    text,
  region      text,
  status      text        not null default 'pending',
  created_at  timestamptz default now()
);

create table if not exists public.products (
  id          uuid          primary key default gen_random_uuid(),
  store_id    uuid          not null references public.stores(id) on delete cascade,
  name        text          not null,
  description text,
  price_usd   numeric(10,2) not null,
  status      text          not null default 'draft',
  created_at  timestamptz   default now()
);

create table if not exists public.product_variants (
  id         uuid    primary key default gen_random_uuid(),
  product_id uuid    not null references public.products(id) on delete cascade,
  size       text,
  color      text,
  color_hex  text,
  stock      integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.product_images (
  id         uuid    primary key default gen_random_uuid(),
  product_id uuid    not null references public.products(id) on delete cascade,
  url        text    not null,
  position   integer not null default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS
-- ============================================================

alter table public.stores           enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images   enable row level security;

-- Helper: returns true when the calling user owns the given store.
-- security definer so sub-policies can query stores without recursion risk.
create or replace function public.owns_store(p_store_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.stores
    where id = p_store_id and owner_id = auth.uid()
  );
$$;

-- ---- stores ----

-- Anon and authenticated can read active stores; owners see their own regardless of status
create policy "stores_public_select" on public.stores
  for select using (
    status = 'active' or owner_id = auth.uid()
  );

create policy "stores_vendor_insert" on public.stores
  for insert with check (owner_id = auth.uid());

create policy "stores_vendor_update" on public.stores
  for update using  (owner_id = auth.uid())
  with check        (owner_id = auth.uid());

-- ---- products ----

-- Public sees active products in active stores; store owner sees all of their own products
create policy "products_public_select" on public.products
  for select using (
    (
      status = 'active'
      and exists (
        select 1 from public.stores
        where id = store_id and status = 'active'
      )
    )
    or public.owns_store(store_id)
  );

create policy "products_vendor_write" on public.products
  for all
  using     (public.owns_store(store_id))
  with check(public.owns_store(store_id));

-- ---- product_variants ----

create policy "variants_public_select" on public.product_variants
  for select using (
    exists (
      select 1
      from public.products p
      join public.stores   s on s.id = p.store_id
      where p.id = product_id
        and p.status = 'active'
        and s.status = 'active'
    )
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_store(p.store_id)
    )
  );

create policy "variants_vendor_write" on public.product_variants
  for all
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_store(p.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_store(p.store_id)
    )
  );

-- ---- product_images ----

create policy "images_public_select" on public.product_images
  for select using (
    exists (
      select 1
      from public.products p
      join public.stores   s on s.id = p.store_id
      where p.id = product_id
        and p.status = 'active'
        and s.status = 'active'
    )
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_store(p.store_id)
    )
  );

create policy "images_vendor_write" on public.product_images
  for all
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_store(p.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id and public.owns_store(p.store_id)
    )
  );

-- ============================================================
-- SEED DATA  (explicit UUIDs → idempotent on re-runs)
-- ============================================================

-- Seed vendor — inserted directly into public.users, bypasses auth.users intentionally
-- (dev/demo only; real vendors sign up via Phone OTP)
insert into public.users (id, email, phone, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'demo.vendor@souk.test',
  '+96170000001',
  'vendor'
)
on conflict (id) do nothing;

-- Stores
insert into public.stores (id, owner_id, name, description, whatsapp, region, status)
values
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Levant Threads',
    'Contemporary Lebanese womenswear rooted in regional craft traditions.',
    '+96171234567',
    'Beirut',
    'active'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Cedar Atelier',
    'Handcrafted leather goods and accessories from the Bekaa Valley.',
    '+96179876543',
    'Jounieh',
    'active'
  )
on conflict (id) do nothing;

-- Products
insert into public.products (id, store_id, name, description, price_usd, status)
values
  (
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Embroidered Linen Kaftan',
    'Hand-embroidered open kaftan in natural linen with gold threadwork inspired by Phoenician motifs.',
    148.00,
    'active'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Arabesque Silk Scarf',
    'Lightweight 100% silk scarf featuring a hand-painted arabesque repeat in terracotta and ivory.',
    62.00,
    'active'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000003',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'Structured Cedar Tote',
    'Full-grain vegetable-tanned leather tote with cedar wood handles. Handmade in Zahle.',
    220.00,
    'active'
  )
on conflict (id) do nothing;

-- Variants
insert into public.product_variants (id, product_id, size, color, color_hex, stock)
values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'S/M',  'Natural Linen',   '#D4C5A9', 4),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'L/XL', 'Natural Linen',   '#D4C5A9', 3),
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'S/M',  'Terracotta',      '#C8622A', 2),
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', null,   'Ivory / Terracotta','#FAF7F2', 8),
  ('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000002', null,   'Navy / Gold',     '#1B2A4A', 5),
  ('cccccccc-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000003', null,   'Cognac',          '#8B4513', 2),
  ('cccccccc-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000003', null,   'Midnight',        '#1C1612', 1)
on conflict (id) do nothing;

-- Images  (position 0 = cover shot)
insert into public.product_images (id, product_id, url, position)
values
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'https://placehold.co/800x1000/D4C5A9/1C1612?text=Kaftan+Front',  0),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'https://placehold.co/800x1000/D4C5A9/1C1612?text=Kaftan+Detail', 1),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'https://placehold.co/800x800/FAF7F2/C8622A?text=Scarf+Flat',     0),
  ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', 'https://placehold.co/800x800/1B2A4A/FAF7F2?text=Scarf+Draped',   1),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000003', 'https://placehold.co/800x800/8B4513/FAF7F2?text=Tote+Front',     0),
  ('dddddddd-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000003', 'https://placehold.co/800x800/8B4513/FAF7F2?text=Tote+Open',      1)
on conflict (id) do nothing;
