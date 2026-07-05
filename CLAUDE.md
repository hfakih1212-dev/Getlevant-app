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

## Pending / Known Issues
- WhatsApp notifications deployed but `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` secrets not set
- Branch is ahead of `origin/main` — needs push
- Push notifications: pipeline is live (`push-notify` Edge Function + token registration in
  ProfileScreen) but requires a fresh EAS dev build — `expo-notifications` added a native module
- No referral redemption flow yet — codes exist on users but nothing consumes them at checkout

## Recently shipped (2026-07-05)
- Guest browsing: unauthenticated users get ShopperStack (feed/product/store/cart);
  Login is a screen inside the stack, auth-only screens registered only when signed in
- Deep links: `souk://product/:id`, `souk://store/:id` (+ web paths); share buttons on
  product + store screens (`src/lib/share.ts`)
- Reviews: `reviews` table (one per delivered order, RLS-gated), star prompt in MyOrders,
  review list on StoreProfile, `stores.rating` maintained by trigger
- Product photo editing in ProductManagementScreen edit mode (add/remove, storage cleanup)
- Vendor self-onboarding via ProfileScreen ("Start Selling", inline confirm — no Alert.alert)
