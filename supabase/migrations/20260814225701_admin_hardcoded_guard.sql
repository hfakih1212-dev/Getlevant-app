-- Hardcode the admin gate to a single named account rather than the mutable
-- users.role column — role='admin' could be set on any row by mistake or by
-- a future feature; this makes "only the platform owner" an explicit,
-- reviewable constant instead of a database value that can drift.
--
-- If a second admin is ever needed, add their email to this list and ship a
-- new migration — deliberately not data-driven.
create or replace function public.is_hardcoded_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and email = 'hfakih1212@gmail.com'
  );
$$;

revoke execute on function public.is_hardcoded_admin() from public, anon;
grant  execute on function public.is_hardcoded_admin() to authenticated;

-- Re-gate the existing vendor-overview RPC on the hardcoded check instead of
-- the role column.
create or replace function public.admin_vendor_analytics()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_hardcoded_admin() then
    raise exception 'admin_vendor_analytics: admin only';
  end if;

  select jsonb_build_object(
    'total_vendors', (select count(*) from public.stores),

    'vendors_by_status', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select status, count(*) as cnt
        from public.stores
        group by status
      ) s
    ),

    'new_vendors_by_month', (
      select coalesce(jsonb_agg(jsonb_build_object('month', month, 'count', cnt) order by month), '[]'::jsonb)
      from (
        select
          to_char(bucket, 'YYYY-MM') as month,
          count(s.id) as cnt
        from generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) as bucket
        left join public.stores s
          on date_trunc('month', s.created_at) = bucket
        group by bucket
      ) m
    ),

    'top_vendors_by_products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'store_id', id, 'name', name, 'product_count', product_count
      ) order by product_count desc), '[]'::jsonb)
      from (
        select s.id, s.name, count(p.id) as product_count
        from public.stores s
        left join public.products p on p.store_id = s.id
        group by s.id, s.name
        order by product_count desc
        limit 5
      ) t
    ),

    'top_vendors_by_recent_activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'store_id', id, 'name', name, 'last_order_at', last_order_at
      ) order by last_order_at desc nulls last), '[]'::jsonb)
      from (
        select s.id, s.name, max(o.created_at) as last_order_at
        from public.stores s
        join public.orders o on o.store_id = s.id
        group by s.id, s.name
        order by last_order_at desc
        limit 5
      ) t
    )
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-vendor directory + shareable "your shop on Getlevant" card data.
-- Both admin-only via the same hardcoded check; both security definer since
-- the caller (admin) isn't the store owner and stores_public_select only
-- exposes active stores or the owner's own row.
-- ---------------------------------------------------------------------------

create or replace function public.admin_vendor_list()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_hardcoded_admin() then
    raise exception 'admin_vendor_list: admin only';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'store_id', id, 'name', name, 'logo_url', logo_url,
    'region', region, 'status', status
  ) order by name), '[]'::jsonb)
  into result
  from public.stores;

  return result;
end;
$$;

revoke execute on function public.admin_vendor_list() from public, anon;
grant  execute on function public.admin_vendor_list() to authenticated;

create or replace function public.admin_vendor_card(p_store_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_hardcoded_admin() then
    raise exception 'admin_vendor_card: admin only';
  end if;

  select jsonb_build_object(
    'store_id',        s.id,
    'name',            s.name,
    'logo_url',        s.logo_url,
    'region',          s.region,
    'rating',          s.rating,
    'review_count',    (select count(*) from public.reviews r where r.store_id = s.id),
    'member_since',    s.created_at,
    'products_listed', (select count(*) from public.products p where p.store_id = s.id and p.status = 'active'),
    'orders_delivered', (select count(*) from public.orders o where o.store_id = s.id and o.status = 'delivered'),
    'total_revenue_usd', (
      select coalesce(sum(o.total_usd), 0)
      from public.orders o
      where o.store_id = s.id and o.status = 'delivered'
    )
  )
  into result
  from public.stores s
  where s.id = p_store_id;

  if result is null then
    raise exception 'admin_vendor_card: no store with id %', p_store_id;
  end if;

  return result;
end;
$$;

revoke execute on function public.admin_vendor_card(uuid) from public, anon;
grant  execute on function public.admin_vendor_card(uuid) to authenticated;
