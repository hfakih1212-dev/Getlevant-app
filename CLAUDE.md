# Souk App — Claude Instructions

## Project Overview
Souk is a mobile-first marketplace app connecting shoppers with local vendors. Built with React Native (Expo SDK 56) + Supabase. Two user roles: **shopper** (browse, cart, checkout, track orders) and **vendor** (manage store, products, orders, courier dispatch).

## Tech Stack
- **Frontend**: React Native + Expo SDK 56, TypeScript strict mode, React Navigation v7
- **State**: Zustand (`src/store/`)
- **Backend**: Supabase (PostgreSQL, Auth, RLS, Storage, Realtime, Edge Functions)
- **Auth**: Email OTP via Resend (Send Email Hook → `send-otp-email` Edge Function)
- **Notifications**: WhatsApp Cloud API via `whatsapp-notify` Edge Function
- **Builds**: EAS (Expo Application Services) — project `@faks1231/souk-app`

## Key Credentials & IDs
- Supabase project ref: `fhsnjdwciwzpkzwvcbrl`
- Supabase URL: `https://fhsnjdwciwzpkzwvcbrl.supabase.co`
- EAS project ID: `e8d64369-afb7-434a-8897-69ab61d29e37`
- Anon key: in `.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## File Structure
```
src/
  screens/
    auth/          PhoneLoginScreen, CheckEmailScreen (OTP entry)
    shopper/       MarketplaceFeedScreen, ProductDetailScreen, CartScreen,
                   CheckoutScreen, OrderConfirmationScreen, MyOrdersScreen,
                   ShipmentTrackingScreen
    vendor/        VendorDashboardScreen, ProductManagementScreen,
                   StoreOnboardingScreen, StoreSettingsScreen, ShipmentCreateScreen
    shared/        ProfileScreen
  store/
    useAuthStore.ts   — session + users table row, calls ensure_my_profile() RPC on login
    useCartStore.ts   — Zustand cart (items, addItem, clearCart)
  lib/
    supabase.ts    — createClient with SecureStore adapter
    whatsapp.ts    — fire-and-forget Edge Function caller
  navigation/
    RootNavigator.tsx  — Auth / Shopper / Vendor stacks; role from users.role
  types/
    supabase.ts    — generated DB types

supabase/
  functions/
    whatsapp-notify/   — WhatsApp Cloud API notifications
    send-otp-email/    — Resend email hook (auth Send Email Hook)
  migrations/          — ordered SQL files, applied via supabase db push
```

## Database Schema (key tables)
- `public.users` — mirrors auth.users; columns: id, email, phone, role, store_id, notification_prefs, push_token
- `public.stores` — vendor stores; columns: id, owner_id, name, region, whatsapp, ...
- `public.products` — catalog; belongs to store
- `public.product_variants` — size/color/stock
- `public.product_images` — Storage-backed image URLs
- `public.orders` — shopper orders; status enum: placed→confirmed→preparing→ready→dispatched→delivered
- `public.order_items` — line items with snapshotted price
- `public.shipments` — courier details per order
- `public.shipment_events` — status history

## Auth Flow
1. User enters email → `signInWithOtp` (no emailRedirectTo)
2. Supabase Send Email Hook → `send-otp-email` Edge Function → Resend sends 6-digit code
3. User enters code → `verifyOtp({ email, token, type: 'email' })`
4. `onAuthStateChange` fires → `useAuthStore` fetches `public.users` row
5. If no row (pre-trigger user): calls `ensure_my_profile()` RPC to create it
6. Navigator: `session === null` → AuthStack; `user.role === 'vendor'` → VendorStack; else → ShopperStack

## Navigation
- All users default to **ShopperStack** unless `users.role = 'vendor'`
- No in-app role selection screen yet — vendors must be set manually in DB or via future onboarding

## Common Commands
```bash
# Type check
npx tsc --noEmit

# Run web preview
npx expo start --web

# Run on Android emulator
npx expo start --android

# EAS dev build (APK)
eas build --profile development --platform android

# Push Supabase migrations
npx supabase db push --project-ref fhsnjdwciwzpkzwvcbrl

# Deploy Edge Function
npx supabase functions deploy <name> --project-ref fhsnjdwciwzpkzwvcbrl

# Set Supabase secret
npx supabase secrets set KEY=value --project-ref fhsnjdwciwzpkzwvcbrl
```

## Coding Standards
- **TypeScript strict** — no `any`, no non-null assertions without a comment explaining why
- **No magic strings** — use enum values from `Database['public']['Enums']`
- **No `useEffect` for data fetching on tab screens** — use `useFocusEffect` instead so data refreshes on re-visit
- **PostgREST**: use `.maybeSingle()` not `.single()` to avoid 406 errors when row might not exist
- **Supabase queries**: always destructure `{ data, error }` and handle both
- **Comments**: only when the WHY is non-obvious. No docblocks, no task references
- **Styles**: StyleSheet.create at bottom of file, no inline styles
- **Colors**: use the design tokens — `#FFFFFF` (background), `#1C1612` (text), `#D9552B` (primary/terracotta), `#7A6A5A` (muted text), `#ECE6DC` (hairline border), `#D9CFC4` (input border), `#F5EFE6` (sand fill), `#F0E9DF` (image placeholder/skeleton)
- **Buttons**: primary CTAs are terracotta pills — height 56, `borderRadius: 28`

## Things to Never Do
- Never `git add -A` or `git add .` — stage files by name only
- Never commit `.claude/settings.local.json`
- Never use `.single()` on queries that might return no rows
- Never put service role key in client-side code
- Never skip `--no-verify` on hooks
- Always include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` in commits

## Web Deployment
- Production web app: **https://souk-app.expo.app** (EAS Hosting)
- Deploy: `npx expo export --platform web && npx eas-cli deploy --prod --non-interactive`
- Share links (`src/lib/share.ts` WEB_BASE_URL) and deep-link prefixes point at this domain

## Monetization
- Free to enter; revenue from programmatic banner ads + paid vendor "Promoted" placements
- `products.is_promoted` / `products.promotion_expires_at` drive feed priority sorting.
  **Writable only by the service role** — a `products_guard_promotion` trigger silently
  resets both columns on any write that doesn't carry a service-role JWT, so a vendor
  can't grant themselves the paid placement through the app (they own the row under RLS,
  so without this guard a normal update call would work). Direct SQL/dashboard writes
  also pass through (no JWT role claim = guard is a no-op) — that's the admin activation
  path until a payment/entitlement Edge Function exists to set these for real.
- In-feed ad slots: `AD_INTERVAL` in `MarketplaceFeedScreen.tsx` inserts a full-width
  `AdSlotCard` placeholder every N organic cards (currently 8). It's a reserved-space
  placeholder only — no ad SDK is installed. Mounting a real network (AdMob via
  `react-native-google-mobile-ads`, or another provider) needs an app ID + ad unit IDs
  and a config-plugin decision; flag before adding, it's a native dependency requiring
  a new build.

## Pending / Known Issues
- WhatsApp notifications deployed but `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` secrets not set
- Migration `20260717000000_promotion_requests.sql` written but NOT pushed to the remote DB yet
  (db push needs interactive approval) — run `npx supabase db push --project-ref fhsnjdwciwzpkzwvcbrl`
  before the promotion-request UI can submit
- RTL: infrastructure is wired (web flips document.dir immediately; native uses
  I18nManager and applies on next app launch) but no visual QA pass has been done
  in Arabic yet — layouts may need per-screen fixes
- Push notifications: dev-build APK under `com.souklb.app` built 2026-07-17
  (EAS build da0b938b) — needs a device install + end-to-end push test
- Store screenshots not captured yet (copy is done — see `store-listing/listing-copy.md`)
- Referral payoff mints vouchers on first *delivered* order (milestone 0 = referral reward)

## Recently shipped (2026-07-17)
- Promotion purchase-request flow: `promotion_requests` table (RLS: vendor
  insert/select own store only, one pending per product) + admin-only
  `approve_promotion_request()` / `reject_promotion_request()` SQL helpers
  (execute revoked from app roles; approval stacks onto an existing expiry).
  Vendor UI: "Promoted Placement" section in ProductManagement edit mode —
  pick 7/30 days, request, team arranges payment over WhatsApp (off-platform,
  consistent with checkout)
- i18n complete: all vendor screens, Profile, payment-method labels, order
  status/category/condition/region labels now EN/AR/FR; keys use enum-suffix
  pattern (`t(\`status.${status}\`)`); RTL wiring in `src/lib/i18n.ts`
- Alert.alert eliminated from vendor flows: dashboard cancel-order is an
  inline two-tap confirm, shipment-create failure is inline error text
- Store-listing copy (EN/AR/FR titles, descriptions, keywords) in `store-listing/`

## Recently shipped (2026-07-10, ads & promotion)
- `products.is_promoted` / `promotion_expires_at` + service-role-only guard trigger
  (see Monetization above)
- Feed: promoted-eligible products stable-sort to the top of every category/search
  view; in-feed ad slot placeholders every 8 organic cards (row-chunked grid —
  MarketplaceFeedScreen no longer uses FlatList's numColumns)
- Terracotta "Sponsored" strip on promoted product cards; read-only "Promoted" chip
  in the vendor's own inventory list (ProductManagementScreen)

## Recently shipped (2026-07-05, second batch)
- Web app deployed to EAS Hosting; share links are real public URLs
- Voucher redemption at checkout — server-authoritative via orders_apply_voucher trigger;
  referral code entry for first-time buyers (redeem_referral RPC + users.referred_by)
- Favorites: hearts on feed/product cards, Saved screen (`/saved`), useFavoritesStore
- Store logos: upload in StoreSettings (product-images bucket, `<store_id>/logo-*`),
  shown on store profile, product store card, featured-boutique rail
- Editorial feed rails: Featured boutique, New this week, Thrifted picks
- Rating stars on feed cards; i18n foundation with language picker in Profile
- eas.json preview/production profiles fleshed out

## Recently shipped (2026-07-05)
- Guest browsing: unauthenticated users get ShopperStack (feed/product/store/cart);
  Login is a screen inside the stack, auth-only screens registered only when signed in
- Deep links: `souk://product/:id`, `souk://store/:id` (+ web paths); share buttons on
  product + store screens (`src/lib/share.ts`)
- Reviews: `reviews` table (one per delivered order, RLS-gated), star prompt in MyOrders,
  review list on StoreProfile, `stores.rating` maintained by trigger
- Product photo editing in ProductManagementScreen edit mode (add/remove, storage cleanup)
- Vendor self-onboarding via ProfileScreen ("Start Selling", inline confirm — no Alert.alert)
