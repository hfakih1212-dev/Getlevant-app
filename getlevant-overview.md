# Getlevant — Project Briefing

*Written 2026-07-14 for handing context to another Claude session (e.g. Claude Desktop). Paste this whole file into the chat to bring it up to speed. Renamed from "Souk" to "Levant" on 2026-07-20, then superseded by "Getlevant" on 2026-07-22 — see "Rename status" below for what's still catching up.*

## What it is

Getlevant is a mobile-first marketplace connecting shoppers with local Lebanese boutiques — new and thrifted fashion. Shoppers browse a feed, order, and track delivery; vendors run their store, catalog, and courier dispatch from the same app. Payments settle off-platform (WhatsApp, cash on delivery, bank transfer) — deliberate for the Lebanon market, so no card-processing dependency blocks launch. Free to enter; monetization is programmatic ads + paid vendor "Promoted" placements (see below).

## Repo & environment

- Local path: `C:\Projects\Levant-app` (Windows) — renamed from `Souk-app` on 2026-07-20; not yet renamed again to match "Getlevant" (folder rename deferred to the end of the 2026-07-22 pass)
- GitHub: `https://github.com/hfakih1212-dev/Souk-app` (branch `main`) — ⚠️ repo itself not yet renamed on GitHub (attempted both 2026-07-20 and 2026-07-22, same PAT-permission failure both times); update this line and the local git remote if/when it is
- Full project instructions live in `CLAUDE.md` at the repo root — read that first if you have file access; this doc is the no-file-access summary.

## Tech stack

| Layer | Choice |
|---|---|
| App | React Native + Expo SDK 56, TypeScript strict, React Navigation v7 |
| State | Zustand (`src/store/`) |
| Backend | Supabase — Postgres + RLS, Auth, Storage, Realtime, Edge Functions |
| Auth | Email OTP (6-digit code) via Resend, through a `send-otp-email` Edge Function (Supabase Send Email Hook) |
| Notifications | WhatsApp Cloud API (`whatsapp-notify` Edge Function) + Expo push (`push-notify` Edge Function) |
| i18n | Custom lightweight layer (`src/lib/i18n.ts`) — EN/AR/FR |
| Builds | EAS (Expo Application Services) |
| Web | Deployed via EAS Hosting |

## Key IDs & URLs

- Supabase project ref: `fhsnjdwciwzpkzwvcbrl` (`https://fhsnjdwciwzpkzwvcbrl.supabase.co`) — dashboard name still `Souk-Backend`; no CLI rename support, needs a manual dashboard rename
- EAS project ID: `b8eddc64-66b8-40ba-b2e5-57c659fa0bbf` (`@faks1231/getlevant`) — a **brand-new** EAS project created 2026-07-22 (`eas init --force`) to get the `getlevant` slug; the previous project `@faks1231/souk-app` (`e8d64369-afb7-434a-8897-69ab61d29e37`) still exists with its full build/OTA history but is no longer linked
- **Production web app: https://getlevant.expo.app** — live as of the 2026-07-22 prod deploy under the new EAS project. The old `souk-app.expo.app` still resolves (serving the 2026-07-20 Levant build) but nothing in this repo points at it anymore
- Native bundle ID in code: `com.getlevant.app` (both platforms) — changed from `com.levant.app` on 2026-07-22; any dev/prod build installed before that date is a different, orphaned app (same lineage as `com.anonymous.soukapp` → `com.souklb.app` → `com.levant.app` → `com.getlevant.app`). A fresh dev build was triggered same day (EAS build `fa18ec1b-005b-4f74-9ea5-b58c7152e531`)
- Anon key lives in `.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY` — never the service role key client-side

## Rename status (2026-07-22, second rename)

Code, docs, and local config say "Getlevant" everywhere except applied history (SQL
migrations, past build hashes/APK names, the `SOUK-` referral code prefix already in the
DB, the seed store name "Levant Threads" which is unrelated demo-data business naming).
Outside-the-repo pieces, after attempting all of them — see `CLAUDE.md` → "Rename
follow-ups" for full detail:
- ✅ EAS fork accepted this time (unlike the Levant rename, which deliberately avoided it) — new project `@faks1231/getlevant`
- ✅ Web prod deploy done — `getlevant.expo.app` now serves the Getlevant build
- ✅ Fresh dev build triggered under `com.getlevant.app` (build `fa18ec1b…`)
- ⛔ GitHub repo NOT renamed — `gh repo rename` failed again, same PAT permission gap as 2026-07-20
- ⛔ Supabase project NOT renamed — no CLI support, dashboard-only
- ⛔ Supabase Auth redirect-URL allowlist NOT synced to remote — `config.toml` has the new `getlevant://` scheme locally, but `supabase config push` was blocked by the permission classifier
- ⛔ Two pending DB migrations still not pushed (unrelated to the rename — a promotion-request table and a stock-decrement RLS fix from 2026-07-20/21) — also blocked by the classifier

## Feature set (what's live today)

**Shopper**
- Guest browsing — feed, product detail, store profiles, and cart all work without an account; sign-in is only required at checkout and for account screens (orders, profile, favorites)
- Single-screen two-stage email OTP login
- Marketplace feed: 2-column image-first grid, search, category/region filters, price/newest sort, pull-to-refresh, skeleton loading, editorial rails (Featured boutique, New this week, Thrifted picks)
- Product detail with size/color variants, share button (deep + web links), favorite heart
- Reviews: one star rating + comment per delivered order, shown on store profiles
- Favorites: hearts on cards, dedicated Saved Items screen
- Cart → checkout (with voucher redemption + referral code entry) → order confirmation → order history → shipment tracking with courier event timeline
- Loyalty: tier badges, referral codes, discount vouchers minted at order milestones and on successful referrals
- Language picker (EN/AR/FR) in Profile, persisted per device

**Vendor**
- Store onboarding + self-serve "Start Selling" upgrade from Profile
- Dashboard with order pipeline (placed → confirmed → preparing → ready → dispatched → delivered)
- Product management: create/edit products with variants, stock, up to 4 photos (add/remove) in Supabase Storage; delete a product (hard-delete, or unlist if it has order history)
- Store settings incl. logo upload
- Shipment/courier dispatch per order
- Read-only "Promoted" indicator on their own listings (see Monetization)

**Platform**
- Role-based navigation (shopper vs. vendor stacks) driven by `users.role`
- RLS throughout; generated TypeScript DB types; no `any` in the codebase
- WhatsApp + Expo push notifications on order events (push requires a device install; WhatsApp secrets not yet configured)
- Design system: white canvas, terracotta `#D9552B` accent, sand fills, pill CTAs

## Monetization (shipped 2026-07-10)

- `products.is_promoted` (bool) / `products.promotion_expires_at` (timestamp) drive feed priority sorting — promoted, non-expired products stable-sort to the top of every category/search view.
- **These columns are writable only by the service role.** A `products_guard_promotion` Postgres trigger silently resets both on any write that doesn't carry a service-role JWT — vendors own their product rows under RLS, so without this guard a normal client update would let them grant themselves the paid placement for free. Direct SQL/dashboard writes pass through (no JWT role claim = guard no-op); that's the current admin activation path until a real payment/entitlement Edge Function exists.
- In-feed ad slots: a full-width placeholder card (`AdSlotCard`) is inserted every 8 organic product cards in the feed grid. It's a reserved-space placeholder only — no ad SDK installed yet. Wiring a real network (e.g. AdMob via `react-native-google-mobile-ads`) needs an app ID + ad unit IDs and a native config-plugin decision — flag before adding, it requires a new build.
- Promoted cards get a terracotta "✦ Sponsored" strip, visually distinct from the neutral ad-slot placeholder so shoppers can tell a paid vendor boost from a third-party ad.

## Data model (key tables)

`users` (mirrors auth.users; role, notification prefs, push_token, loyalty counters, referral_code, referred_by) · `stores` (owner, region, whatsapp, logo_url, rating) · `products` (+ `is_promoted`/`promotion_expires_at`) / `product_variants` / `product_images` · `orders` (+ `voucher_code`/`discount_usd`) / `order_items` (snapshotted prices) · `shipments` / `shipment_events` · `reviews` (one per delivered order) · `favorites` · `rewards` (loyalty/referral vouchers) · `promotion_requests` (vendor-filed, admin-approved — migration written, not yet pushed)

## Conventions this project follows

- TypeScript strict, no `any`, no `.single()` on queries that might return zero rows (use `.maybeSingle()`)
- No `useEffect` for data fetching on tab screens — use `useFocusEffect` so data refreshes on revisit
- Comments only when the *why* is non-obvious; no docblocks
- Alert.alert() is avoided for critical actions — it's a silent no-op on Expo web; use inline UI state instead
- Colors: `#FFFFFF` bg, `#1C1612` text, `#D9552B` terracotta primary, `#7A6A5A` muted text, `#ECE6DC` hairline border, `#F5EFE6` sand fill
- Primary buttons: terracotta pills, height 56, `borderRadius: 28`
- Never `git add -A`/`git add .` — stage files by name; never commit `.claude/settings.local.json`
- Commits end with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Web deploy: `npx expo export --platform web && npx eas-cli deploy --prod --non-interactive`

## Known gaps / what's next

- WhatsApp notifications deployed but `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` secrets not set
- Push notifications need a device install of a fresh dev build (bundle ID now `com.getlevant.app`; the previous `com.levant.app` build is orphaned)
- i18n covers the shopper funnel (feed, product, cart, login, checkout) only; vendor screens, RTL layout (I18nManager), and remaining copy are follow-ups
- No payment/entitlement flow yet for vendors to actually buy a "Promoted" placement — activation is admin-only via direct SQL today
- No real ad network wired into the in-feed ad slots (placeholder only)
- Store-listing assets (screenshots, app store copy) not produced — copy is done and updated for Getlevant, screenshots still pending
- Two DB migrations and one Supabase config sync still need a human to push (see "Rename status" above)

## How to check it right now

Open **https://getlevant.expo.app** on any phone or desktop browser — it's current and serving the Getlevant-branded build (deployed 2026-07-22). For native-only features (push notifications, real device install), a fresh EAS dev build under `com.getlevant.app` was triggered 2026-07-22 (build `fa18ec1b-005b-4f74-9ea5-b58c7152e531`) — check https://expo.dev/accounts/faks1231/projects/getlevant/builds for status and install it.
