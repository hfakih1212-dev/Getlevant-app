-- Remove the WhatsApp notification pipeline (whatsapp-notify Edge Function,
-- deleted from the repo). The app now relies solely on Expo push
-- (push-notify) for order notifications. This does NOT touch stores.whatsapp
-- (kept as a vendor contact field) or the 'whatsapp' payment_method option
-- (an unrelated, separate feature — paying by negotiating over WhatsApp).

-- ============================================================
-- place_order(): drop the whatsapp_sent column from the insert.
-- Same signature as 20260728161943_place_order_voucher_default.sql.
-- ============================================================

create or replace function public.place_order(
  p_store_id         uuid,
  p_payment_method    text,
  p_delivery_address  text,
  p_delivery_region   text,
  p_items             jsonb,
  p_voucher_code      text default null
)
returns table (id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_method public.payment_method;
  v_order_id       uuid;
  v_order_number   text;
  v_subtotal       numeric(12,2) := 0;
  v_item           jsonb;
  v_product_id     uuid;
  v_variant_id     uuid;
  v_quantity       integer;
  v_price          numeric(10,2);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item.' using errcode = 'P0003';
  end if;

  if not exists (select 1 from public.stores where id = p_store_id) then
    raise exception 'Store not found.' using errcode = 'P0003';
  end if;

  v_payment_method := p_payment_method::public.payment_method;

  -- Pass 1: validate every item against server truth and total the real
  -- subtotal. Price always comes from public.products.price_usd — never
  -- from the client payload.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Invalid quantity for product %.', v_product_id using errcode = 'P0003';
    end if;

    select p.price_usd into v_price
    from public.products p
    join public.product_variants pv on pv.product_id = p.id
    where p.id = v_product_id
      and pv.id = v_variant_id
      and p.store_id = p_store_id
      and p.status = 'active';

    if v_price is null then
      raise exception 'Product % is not available from this store.', v_product_id
        using errcode = 'P0003';
    end if;

    v_subtotal := v_subtotal + (v_price * v_quantity);
  end loop;

  -- Header insert. subtotal_usd is the sum computed above, not a
  -- client-supplied figure; discount_usd/total_usd get overwritten
  -- authoritatively by the existing orders_apply_voucher trigger.
  insert into public.orders (
    shopper_id, store_id, status, payment_method, payment_status,
    subtotal_usd, delivery_fee_usd, total_usd,
    voucher_code, delivery_address, delivery_region
  )
  values (
    auth.uid(), p_store_id, 'placed', v_payment_method, 'pending',
    v_subtotal, 0, v_subtotal,
    p_voucher_code, p_delivery_address, p_delivery_region
  )
  returning orders.id, orders.order_number into v_order_id, v_order_number;

  -- Pass 2: insert line items with the same server-priced values. This also
  -- fires decrement_variant_stock per row, so an out-of-stock item raises
  -- P0001 and rolls back the whole order (header included).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;

    select p.price_usd into v_price
    from public.products p
    where p.id = v_product_id;

    insert into public.order_items (order_id, product_id, variant_id, quantity, unit_price_usd)
    values (v_order_id, v_product_id, v_variant_id, v_quantity, v_price);
  end loop;

  return query select v_order_id, v_order_number;
end;
$$;

revoke execute on function public.place_order(uuid, text, text, text, jsonb, text) from public, anon;
grant  execute on function public.place_order(uuid, text, text, text, jsonb, text) to authenticated;

-- ============================================================
-- Drop the now-unused whatsapp_sent column (grants on it drop with it)
-- ============================================================

alter table public.orders drop column if exists whatsapp_sent;

-- ============================================================
-- Strip whatsapp_reminders from notification_prefs default and existing rows
-- ============================================================

alter table public.users
  alter column notification_prefs set default jsonb_build_object(
    'order_updates', true,
    'promotions',    true
  );

update public.users
  set notification_prefs = notification_prefs - 'whatsapp_reminders'
  where notification_prefs ? 'whatsapp_reminders';
