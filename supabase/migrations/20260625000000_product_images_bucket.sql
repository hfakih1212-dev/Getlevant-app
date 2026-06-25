-- Public storage bucket for product images.
-- Path convention: {storeId}/{productId}/{index}-{timestamp}.{ext}
-- This lets RLS verify ownership via the first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB per file
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ── RLS on storage.objects ────────────────────────────────────────────────────

-- Anyone can read (feed, product detail, order emails)
create policy "product_images_public_read"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Vendors can upload to paths that start with their own store UUID
create policy "product_images_vendor_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.stores
      where owner_id = auth.uid()
        and id::text = (storage.foldername(name))[1]
    )
  );

-- Vendors can delete their own images
create policy "product_images_vendor_delete"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.stores
      where owner_id = auth.uid()
        and id::text = (storage.foldername(name))[1]
    )
  );
