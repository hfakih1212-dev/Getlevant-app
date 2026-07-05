-- Reviews: order-gated store reviews + automatic stores.rating maintenance.
-- One review per delivered order; readable by everyone including guests.

create table if not exists public.reviews (
  id         uuid        primary key default gen_random_uuid(),
  order_id   uuid        not null unique references public.orders(id) on delete cascade,
  store_id   uuid        not null references public.stores(id) on delete cascade,
  shopper_id uuid        not null references public.users(id) on delete cascade,
  rating     integer     not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz default now()
);

create index if not exists reviews_store_id_idx on public.reviews (store_id);

alter table public.reviews enable row level security;

-- Reviews are public marketing surface — anon included
create policy "reviews_public_select" on public.reviews
  for select using (true);

-- Only the buyer of a delivered order may review it; order_id is unique so
-- one review per order. store_id must be qualified as reviews.store_id —
-- unqualified it would bind to o.store_id and the check would be vacuous.
create policy "reviews_shopper_insert" on public.reviews
  for insert with check (
    shopper_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = reviews.order_id
        and o.shopper_id = auth.uid()
        and o.store_id = reviews.store_id
        and o.status = 'delivered'
    )
  );

-- Keep the stores.rating aggregate (numeric(2,1)) in sync on any change
create or replace function public.refresh_store_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.store_id, old.store_id);
  update public.stores s
  set rating = (
    select round(avg(r.rating)::numeric, 1)
    from public.reviews r
    where r.store_id = target
  )
  where s.id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_store_rating();
