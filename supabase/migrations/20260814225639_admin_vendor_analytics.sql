-- Admin vendor analytics: one-shot aggregation RPC for a platform-wide
-- vendor overview (total count, status mix, signup trend, top vendors).
-- There is no vendor-recruitment pipeline (contacted/responded) tracked
-- anywhere in the schema — stores.status goes straight to 'active' at
-- self-serve onboarding (see StoreOnboardingScreen) — so this reports the
-- statuses that actually exist in the data rather than inventing stages.
--
-- security definer so it can aggregate across all stores without per-row
-- RLS churn; gated hard on the caller's own role, mirroring the admin
-- checks already used in stores/products RLS policies.
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
  if not exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'admin_vendor_analytics: admin role required';
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

    -- Signup trend, last 6 calendar months including the current one —
    -- zero-filled via generate_series so a quiet month still renders as a
    -- 0 bar instead of disappearing from the chart
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

    -- "Most products listed" — total catalog size regardless of draft/active
    -- status, since a vendor building out a catalog is meaningful activity
    -- even before anything goes live.
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

    -- "Most recently active" — most recent order received, the clearest
    -- live-activity signal already in the schema
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

revoke execute on function public.admin_vendor_analytics() from public, anon;
grant  execute on function public.admin_vendor_analytics() to authenticated;
