# Souk — Project Overview

*Status brief generated from the codebase, 2026-07-03.*

Souk is a mobile-first marketplace connecting shoppers with local Lebanese boutiques. Shoppers browse a curated feed, order, and track delivery; vendors run their store, catalog, and courier dispatch from the same app. Payments are settled off-platform (WhatsApp, cash on delivery, bank transfer) — a deliberate fit for the Lebanon market, so no card-processing dependency blocks launch.

## Stack

| Layer | Choice |
|---|---|
| App | React Native + Expo SDK 56, TypeScript (strict), React Navigation v7 |
| State | Zustand |
| Backend | Supabase — Postgres + RLS, Auth, Storage, Edge Functions |
| Auth | Email OTP (6-digit code) via Resend, wired through a `send-otp-email` Edge Function (Supabase Send Email Hook) |
| Notifications | WhatsApp Cloud API via `whatsapp-notify` Edge Function |
| Builds | EAS (Expo Application Services) |

React 19.2 / React Native 0.85 / supabase-js 2.108. Web preview works via react-native-web.

## What's built (working end to end)

**Shopper**
- Single-screen two-stage OTP login (email → code)
- Marketplace feed: 2-column image-first grid, text search, region filter (8 Lebanese governorates), price/newest sort, pull-to-refresh, loading skeletons, responsive up to tablet/web widths
- Product detail with variants (size / color / stock)
- Cart → checkout → order confirmation → order history → shipment tracking with courier event timeline

**Vendor**
- Store onboarding (name, description, WhatsApp number with E.164 normalization, region)
- Dashboard with order pipeline (status enum: placed → confirmed → preparing → ready → dispatched → delivered)
- Product management: create products with variants, stock counts, and up to 4 photos uploaded to Supabase Storage
- Shipment/courier dispatch per order, store settings
- Shoppers can self-upgrade to vendor in-app (`become_vendor` RPC)

**Platform**
- Role-based navigation (shopper vs. vendor stacks) driven by `users.role`
- 8 ordered SQL migrations: users mirror + trigger, catalog, orders, shipments + events, storage bucket, profile/role RPCs
- RLS throughout; generated TypeScript DB types; zero `any` in the codebase
- Design system: white canvas, terracotta `#D9552B` accent, sand fills, pill CTAs — freshly redesigned to match category leaders (Etsy/Airbnb/Vinted patterns)

## Data model (key tables)

`users` (mirrors auth.users, role, notification prefs) · `stores` (owner, region, WhatsApp) · `products` / `product_variants` / `product_images` · `orders` / `order_items` (snapshotted prices) · `shipments` / `shipment_events` (courier status history)

## Gaps before launch

1. **WhatsApp notifications inert** — function deployed, but `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` secrets not set
2. **No native staging build yet** — EAS build + on-device QA is the next milestone
3. Store-listing assets (screenshots, copy) not produced
4. Repo: local branch ahead of origin; latest redesign uncommitted

## Screenshots

`screenshots/login-mobile.png` and `screenshots/login-desktop.png` — the OTP login screen (web build) at phone and desktop widths, showing the new design system and the centered max-width layout. Authenticated screens (feed, vendor dashboard) require a live OTP session to capture.

## Readiness assessment

Nothing architectural remains between here and a closed beta: the outstanding work is configuration, one staging build, and real-device testing — polish-scale, not build-scale.
