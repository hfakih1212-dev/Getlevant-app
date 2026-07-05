-- Fix product-images upload RLS.
-- In the original policies the unqualified `name` inside the EXISTS subquery
-- bound to stores.name instead of storage.objects.name, so the ownership
-- check compared the store UUID against foldername(<store display name>) —
-- always false, rejecting every vendor upload. Qualify as objects.name.

drop policy if exists "product_images_vendor_insert" on storage.objects;
create policy "product_images_vendor_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.stores s
      where s.owner_id = auth.uid()
        and s.id::text = (storage.foldername(objects.name))[1]
    )
  );

drop policy if exists "product_images_vendor_delete" on storage.objects;
create policy "product_images_vendor_delete"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.stores s
      where s.owner_id = auth.uid()
        and s.id::text = (storage.foldername(objects.name))[1]
    )
  );
