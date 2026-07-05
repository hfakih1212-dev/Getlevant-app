-- Vendor analytics: structured buyer region on orders + one-shot aggregation RPC.
-- delivery_address is free text, so Regional Reach needs its own column;
-- CheckoutScreen now writes it and old orders report as "Unspecified".

alter table public.orders
  add column if not exists delivery_region text;

-- Single round-trip aggregate for the vendor dashboard. security definer so it
-- can aggregate order rows without per-row RLS churn; scoped hard to the
-- calling vendor's own store via auth.uid().
create or replace function public.vendor_analytics()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with my_store as (
    select id from public.stores where owner_id = auth.uid() limit 1
  ),
  store_orders as (
    select o.id, o.total_usd, o.status, o.delivery_region
    from public.orders o
    join my_store s on s.id = o.store_id
  ),
  delivered as (
    select * from store_orders where status = 'delivered'
  ),
  delivered_items as (
    select oi.quantity, p.condition, p.category
    from public.order_items oi
    join delivered d on d.id = oi.order_id
    join public.products p on p.id = oi.product_id
  )
  select jsonb_build_object(
    'total_revenue_usd', coalesce((select sum(total_usd) from delivered), 0),
    'orders_delivered',  (select count(*) from delivered),
    'items_by_condition', (
      select coalesce(jsonb_object_agg(condition::text, qty), '{}'::jsonb)
      from (
        select condition, sum(quantity) as qty
        from delivered_items
        group by condition
      ) c
    ),
    'top_categories', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category, 'units', qty) order by qty desc), '[]'::jsonb)
      from (
        select coalesce(category::text, 'uncategorized') as category, sum(quantity) as qty
        from delivered_items
        group by 1
        order by qty desc
        limit 5
      ) t
    ),
    -- Regional reach counts every live order, not just delivered ones —
    -- a placed order is still a buyer reaching from that region
    'regions', (
      select coalesce(jsonb_agg(jsonb_build_object('region', region, 'orders', cnt) order by cnt desc), '[]'::jsonb)
      from (
        select coalesce(delivery_region, 'Unspecified') as region, count(*) as cnt
        from store_orders
        where status <> 'cancelled'
        group by 1
        order by cnt desc
        limit 8
      ) r
    )
  );
$$;

revoke execute on function public.vendor_analytics() from public, anon;
grant  execute on function public.vendor_analytics() to authenticated;
