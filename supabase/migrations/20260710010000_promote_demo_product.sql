-- Activate one demo promotion so the feed has real promoted data to sort
-- and badge against. This connection carries no PostgREST JWT, so
-- auth.role() is null in the products_guard_promotion trigger (20260710000000)
-- and the write passes through unchanged — the same path a future
-- payment/entitlement Edge Function would use via the service role.
update public.products
set is_promoted = true,
    promotion_expires_at = now() + interval '14 days'
where id = 'bbbbbbbb-0000-0000-0000-000000000002';   -- Arabesque Silk Scarf
