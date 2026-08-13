-- Vendor social contact links: Instagram/Facebook profile URLs, collected at
-- onboarding/settings and shown on the shopper-facing store profile. Simple
-- text links only, same as stores.whatsapp — no OAuth or Graph API
-- integration (deliberately out of scope).

alter table public.stores
  add column if not exists instagram text,
  add column if not exists facebook  text;
