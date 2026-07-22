-- Bug fix: stock was not auto-decrementing on order placement.
--
-- decrement_variant_stock() (see 20260624180000_order_tables.sql) runs as a
-- BEFORE INSERT trigger on order_items, fired when a *shopper* checks out.
-- It was declared without SECURITY DEFINER, so it executed with the
-- inserting shopper's own privileges. product_variants only has one UPDATE
-- policy (variants_vendor_write), which requires owns_store(store_id) —
-- true for the vendor, never true for the shopper placing the order. RLS
-- silently filtered the trigger's own UPDATE down to zero affected rows
-- (no error, since an RLS-filtered UPDATE with no matching rows is not a
-- failure), so the order placed successfully but stock never moved.
--
-- Fix: mark the function SECURITY DEFINER (same pattern already used by
-- approve_promotion_request/reject_promotion_request) so it runs with the
-- privileges of its owner and bypasses RLS for this one, tightly-scoped
-- write. Safe to elevate: the function only ever decrements the exact
-- variant/quantity from a row insert that RLS already confirmed belongs to
-- the calling shopper's own order.

create or replace function public.decrement_variant_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
