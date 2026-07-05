---
name: verify
description: Build, launch, and drive Souk (Expo web) to verify changes end-to-end with Playwright.
---

# Verifying Souk changes

## Launch

```bash
CI=1 npx expo start --web --port 8085 > expo-web.log 2>&1 &   # run in background
# poll http://localhost:8085 until 200 (first bundle takes 30-60s on request)
```

Gotchas (Windows):
- `CI=1` disables Metro watch mode — **restart the server after every code change**, the bundle will NOT refresh.
- Killing the background shell does not kill Metro. Find and kill the real process:
  `netstat -ano | grep :8085` → `taskkill //F //PID <pid>`.

## Drive

Playwright is not a project dependency — install ephemerally:

```bash
npm install --no-save playwright && npx playwright install chromium
```

Write a `.cjs` driver in the repo root (so `require('playwright')` resolves), delete after.
Use `getByText` selectors (RN-web renders Text as divs). Grant
`clipboard-read`/`clipboard-write` permissions to test the share→copy flow.

Flows worth driving as a guest (no OTP needed): feed render, product detail,
store profile, deep links `/product/<id>` and `/store/<id>`, add-to-bag →
cart → sign-in gate → login screen. Seed products: "Embroidered Linen Kaftan"
($148, sizes S/M–L/XL), "Structured Cedar Tote", store "Levant Threads".

**Never submit a real email through the OTP form** — it sends mail via Resend
and creates an auth user. Validation-only probes are fine.

Cart state is in-memory Zustand: a hard `page.goto()` empties the bag — use
in-app navigation (header 🛍 button) to reach the cart with items.

## Server-side checks

- `mcp supabase execute_sql` is **read-only** — behavioral RLS tests via
  `set local role` are impossible; verify policies via `pg_policies` instead.
- Edge functions: POST with the anon key as Bearer + a fake order id; a JSON
  `{"ok":false,"error":"Order not found..."}` 500 proves deploy + auth + DB wiring.
