# Getlevant — Project Briefing

*Paste this whole file into a chat with another Claude session (e.g. Claude Desktop) to bring it up to speed. Last refreshed 2026-07-24.*

## What it is

Getlevant is a mobile-first marketplace connecting shoppers with local Lebanese boutiques — new and thrifted fashion. Shoppers browse a feed, order, and track delivery; vendors run their store, catalog, and courier dispatch from the same app. Payments settle off-platform (WhatsApp, cash on delivery, bank transfer) — deliberate for the Lebanon market, so no card-processing dependency blocks launch. Free to enter; monetization is programmatic ads + paid vendor "Promoted" placements.

Formerly called "Souk," then "Levant" — renamed to "Getlevant" on 2026-07-22. Old domains/bundle IDs from earlier names are dead ends; only what's listed below is current.

## Repo & environment

- Local path: `C:\projects\Getlevant-app` (Windows)
- GitHub: `https://github.com/hfakih1212-dev/Souk-app` (branch `main`) — ⚠️ repo itself still carries the old name; rename attempts have failed twice on a PAT permission gap (`Administration:write` missing)
- Full project instructions live in `CLAUDE.md` at the repo root — read that first if you have file access; this doc is the no-file-access summary

## Tech stack

| Layer | Choice |
|---|---|
| App | React Native + Expo SDK 56, TypeScript strict, React Navigation v7 |
| State | Zustand (`src/store/`) |
| Backend | Supabase — Postgres + RLS, Auth, Storage, Realtime, Edge Functions |
| Auth | Email OTP (6-digit code) via Resend, through a `send-otp-email` Edge Function (Supabase Send Email Hook) |
| Notifications | Expo push (`push-notify` Edge Function) |
| i18n | Custom lightweight layer (`src/lib/i18n.ts`) — EN/AR/FR |
| Builds | EAS (Expo Application Services) |
| Web | Deployed via EAS Hosting |

## Key IDs & URLs

- Supabase project ref: `fhsnjdwciwzpkzwvcbrl` (`https://fhsnjdwciwzpkzwvcbrl.supabase.co`) — dashboard name still shows the old brand; needs a manual dashboard rename
- EAS project: `@faks1231/getlevant` (`b8eddc64-66b8-40ba-b2e5-57c659fa0bbf`)
- **Production web app: https://getlevant.expo.app**
- Native bundle ID: `com.getlevant.app` (both platforms)
- Anon key lives in `.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY` — never the service role key client-side

## Feature set (what's live today)

**Shopper**
- Guest browsing — feed, product detail, store profiles, and cart all work without an account; sign-in only required at checkout and for account screens
- Single-screen two-stage email OTP login
- Marketplace feed: 2-column image-first grid, search, category/region filters, price/newest sort, editorial rails (Featured boutique, New this week, Thrifted picks)
- Product detail with size/color variants, share button, favorite heart
- Reviews (one per delivered order), Favorites (Saved Items screen)
- Cart → checkout (voucher + referral code) → order confirmation → order history → shipment tracking
- Loyalty tiers, referral vouchers
- Language picker (EN/AR/FR)

**Vendor**
- Store onboarding + self-serve "Start Selling" upgrade from Profile
- Dashboard with order pipeline (placed → confirmed → preparing → ready → dispatched → delivered)
- Product management: create/edit/delete products with variants, stock, up to 4 photos
- Store settings incl. logo upload
- Shipment/courier dispatch per order
- Read-only "Promoted" indicator on own listings

**Platform**
- Role-based navigation (shopper vs. vendor stacks) driven by `users.role` — one account is one role at a time, no per-device role
- RLS throughout; generated TypeScript DB types; no `any` in the codebase
- Design system: white canvas, terracotta `#D9552B` accent, sand fills, pill CTAs

## Data model (key tables)

`users` (role, notification prefs, push_token, loyalty/referral) · `stores` (owner, region, whatsapp, instagram, facebook, logo_url, rating) · `products` (+ `is_promoted`/`promotion_expires_at`) / `product_variants` / `product_images` · `orders` (+ `voucher_code`/`discount_usd`) / `order_items` (snapshotted prices) · `shipments` / `shipment_events` · `reviews` · `favorites` · `rewards` · `promotion_requests` (vendor-filed, admin-approved)

## Known issues / pending

- **Email delivery is limited to one address right now.** OTP emails send via Resend's shared test sender (`onboarding@resend.dev`), which only delivers to the single email tied to the Resend account. Every other address — including Gmail `+tag` variants of the same inbox — silently fails to receive the code. Real fix: verify a domain in Resend, then set the `RESEND_FROM_EMAIL` secret. Until then, testing both shopper and vendor requires manually flipping one account's `role` in the database rather than using two separate logins.
- i18n covers the shopper funnel only; vendor screens and RTL visual QA are follow-ups
- No payment/entitlement flow for vendors to buy "Promoted" placement — admin-only via direct SQL today
- No real ad network in the in-feed ad slots (placeholder only)
- Store-listing screenshots not captured yet (copy is done, see `store-listing/listing-copy.md`)

## How to check it right now

Open **https://getlevant.expo.app** on any phone or desktop browser.
