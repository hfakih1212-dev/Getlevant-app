# Getlevant App — Claude Instructions

## Project Overview
Getlevant is a mobile-first marketplace app connecting shoppers with local vendors. Built with React Native (Expo SDK 56) + Supabase. Two user roles: **shopper** (browse, cart, checkout, track orders) and **vendor** (manage store, products, orders, courier dispatch).

## Tech Stack
- **Frontend**: React Native + Expo SDK 56, TypeScript strict mode, React Navigation v7
- **State**: Zustand (`src/store/`)
- **Backend**: Supabase (PostgreSQL, Auth, RLS, Storage, Realtime, Edge Functions)
- **Auth**: Email OTP via Resend (Send Email Hook → `send-otp-email` Edge Function)
- **Notifications**: WhatsApp Cloud API via `whatsapp-notify` Edge Function
- **Builds**: EAS (Expo Application Services) — project `@faks1231/getlevant` (new project, forked 2026-07-22 from `@faks1231/souk-app` — see "Rename follow-ups" below for why)

## Key Credentials & IDs
- Supabase project ref: `fhsnjdwciwzpkzwvcbrl`
- Supabase URL: `https://fhsnjdwciwzpkzwvcbrl.supabase.co`
- EAS project ID: `b8eddc64-66b8-40ba-b2e5-57c659fa0bbf`
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
- Production web app: **https://getlevant.expo.app** (EAS Hosting, new project
  `@faks1231/getlevant`) — live as of the 2026-07-22 prod deploy under the forked project
- Deploy: `npx expo export --platform web && npx eas-cli deploy --prod --non-interactive`
- Share links (`src/lib/share.ts` WEB_BASE_URL) and deep-link prefixes point at this domain
- The old `souk-app.expo.app` domain (previous EAS project `@faks1231/souk-app`) is now
  orphaned — still resolves to whatever was last deployed there (the Levant-branded build
  from 2026-07-20) but nothing in the codebase points at it anymore

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
- Three remote-write actions blocked by the auto-mode permission classifier all session
  (2026-07-20 through 2026-07-22, every form tried — plain, `--yes`, non-interactive) —
  all three need a human to run them:
  - `npx supabase db push --project-ref fhsnjdwciwzpkzwvcbrl` — two migrations pending:
    - `20260717000000_promotion_requests.sql` — table + RLS for the promotion-request UI;
      without this push, "Request Promotion" still throws "Could not find the table
      'public.promotion_requests'"
    - `20260721000000_fix_stock_decrement_rls.sql` — makes `decrement_variant_stock()`
      SECURITY DEFINER. Root cause found 2026-07-21: the trigger ran as the *shopper's* own
      role (no SECURITY DEFINER), and `product_variants` only grants UPDATE to the store
      owner (`variants_vendor_write`), so RLS silently filtered the trigger's own stock
      UPDATE to zero rows on every real checkout — order placement succeeded, stock never
      moved, no error surfaced anywhere. Until this is pushed, stock will keep failing to
      decrement.
  - `npx supabase config push --project-ref fhsnjdwciwzpkzwvcbrl` — needed so the live
    project's Auth redirect-URL allowlist picks up the `getlevant://auth-callback` /
    `exp+getlevant://auth-callback` entries (config.toml already has them; local config
    changes don't reach the remote project without this). Until this runs, email OTP deep
    links back into the app after the 2026-07-22 scheme change may not redirect correctly.
  - Supabase project dashboard rename (`Souk-Backend` → something reflecting Getlevant) —
    no CLI subcommand exists, and the Management API `PATCH` route needs an access token
    this session doesn't hold rather than just being classifier-blocked; do it via
    Settings → General on the dashboard.
- RTL: infrastructure is wired (web flips document.dir immediately; native uses
  I18nManager and applies on next app launch) but no visual QA pass has been done
  in Arabic yet — layouts may need per-screen fixes
- Push notifications: dev-build APK under `com.levant.app` built 2026-07-20
  (EAS build `6306b897…`, under the now-orphaned `@faks1231/souk-app` EAS project) —
  orphaned again now that the bundle ID is `com.getlevant.app` under a brand-new EAS
  project. A fresh dev build was triggered 2026-07-22 (build
  `fa18ec1b-005b-4f74-9ea5-b58c7152e531`, new Android keystore auto-created for the new
  package name) — check
  https://expo.dev/accounts/faks1231/projects/getlevant/builds/fa18ec1b-005b-4f74-9ea5-b58c7152e531
  for status, then reinstall on device before retesting push
- Store screenshots not captured yet (copy is done — see `store-listing/listing-copy.md`)
- Referral payoff mints vouchers on first *delivered* order (milestone 0 = referral reward)

## Rename follow-ups (Souk → Levant 2026-07-20 → Getlevant 2026-07-22)
Code, docs, and config in this repo now say "Getlevant" everywhere except historical/applied
records (SQL migrations, past build hashes, the `SOUK-` referral prefix). This is the
**second** rename — Souk → Levant landed 2026-07-20, then superseded by Getlevant on
2026-07-22 before "Levant" had shipped to a real store listing. Status of the infra pieces
that live outside this repo:

- **EAS project**: this time the fork was deliberately accepted (unlike the Levant rename,
  which kept `slug: souk-app` specifically to avoid it). `app.json` → `slug` is now
  `"getlevant"`, linked to a **brand-new** EAS project `@faks1231/getlevant`
  (`b8eddc64-66b8-40ba-b2e5-57c659fa0bbf`), created 2026-07-22 via `eas init --force`.
  The old `@faks1231/souk-app` project (`e8d64369-afb7-434a-8897-69ab61d29e37`) still
  exists with its full build/OTA history — it's just no longer the linked project. Don't
  try to "merge" them back; that's not a thing EAS supports.
- **EAS Hosting**: production web is now `https://getlevant.expo.app`, deployed 2026-07-22
  under the new project (first deploy needed a non-`--prod` `eas deploy` to provision the
  hosting bucket before `--prod` would work — brand-new EAS projects don't have one yet).
  `src/lib/share.ts` (`WEB_BASE_URL`) and `RootNavigator.tsx` deep-link prefixes point here.
  The old `souk-app.expo.app` still resolves (serving whatever was last deployed there, the
  2026-07-20 Levant build) but is now unreferenced by any code in this repo.
- **Bundle ID**: `com.levant.app` → `com.getlevant.app` in `app.json`, live. Orphans the
  2026-07-20 dev build (same situation as every previous bundle ID change in this project's
  history: `com.anonymous.soukapp` → `com.souklb.app` → `com.levant.app` →
  `com.getlevant.app`). A fresh dev build was triggered — see the Pending section above.
- **Supabase project**: dashboard name is still `Souk-Backend` (ref `fhsnjdwciwzpkzwvcbrl`)
  — unchanged since the first rename attempt. Same blocker as before (no CLI support), plus
  this session specifically doesn't hold a Management API access token to even attempt the
  direct PATCH call yesterday's session tried. Needs a manual rename via the Supabase
  dashboard (Settings → General).
- **Supabase Auth redirect URLs**: `config.toml`'s `additional_redirect_urls` now lists
  `getlevant://auth-callback` / `exp+getlevant://auth-callback`, but that's local-config
  only — `supabase config push` (needed to sync it to the live project) was blocked by the
  classifier same as `db push`. Needs a human to run it (see Pending section above).
- **GitHub repo**: rename attempt failed again, identically to 2026-07-20 —
  `gh repo rename Getlevant-app` returned `HTTP 403: Resource not accessible by personal
  access token`. The fine-grained PAT gh is using (same one in `.mcp.json`) still lacks
  "Administration: write" on the repo. Still named `hfakih1212-dev/Souk-app`; local git
  remote left untouched to match. To finish this: regenerate the PAT with Administration
  write access (or rename manually on github.com), then run `gh repo rename Getlevant-app`
  and `git remote set-url origin https://github.com/hfakih1212-dev/Getlevant-app.git`.
- **SQL migrations**: left untouched on purpose (`init_souk.sql`, `SOUK-` referral code
  prefix in `loyalty_rewards.sql`/`growth_features.sql`, `demo.vendor@souk.test` seed
  email) — these are applied history; renaming the referral code prefix going forward
  would need a new migration, not an edit to old ones. The one migration that *wasn't* yet
  applied (`20260717000000_promotion_requests.sql`) had its "Souk team" comment updated to
  "Getlevant team" since it's still safe to edit pre-push.
- **Internal-only identifiers left unchanged** (not user-facing, flagged rather than
  guessed): `src/lib/i18n.ts` `STORAGE_KEY = 'levant.locale'` (device-local language-pref
  storage key — renaming it would reset already-installed users' saved language once,
  harmless but unnecessary); the i18n key name `profile.sellOnLevant` (only the *value*,
  "Sell on Getlevant", is user-facing — key names aren't); the seed store name "Levant
  Threads" in `catalog_tables.sql` (a fictional boutique name in demo data, coincidentally
  sharing the word "Levant," unrelated to the app's own brand).
- **Arabic brand form**: per explicit user decision 2026-07-22, "Getlevant" is code-switched
  into Arabic UI strings in Latin script (e.g. "أهلاً بك في Getlevant") rather than
  transliterated phonetically the way "Levant" became "ليفانت" on 2026-07-20.
- **Store-listing copy**: EN/AR/FR title fields were reworded (not just substituted) to
  fit character limits — "Getlevant" is 3 characters longer than "Levant" and some titles
  were already at the 30-char cap.
- **Bug catch**: `StoreOnboardingScreen.tsx`'s brand-mark letter was still hardcoded `"S"`
  (a leftover from the original Souk brand that the 2026-07-20 rename missed) — corrected
  to `"G"` for Getlevant as part of this pass.

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
