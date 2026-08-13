// Hardcoded admin allowlist — deliberately not driven by the mutable
// users.role column. This is a route-guard convenience only; the real
// security boundary is the matching check inside the admin_* RPCs
// (see supabase/migrations/20260806010000_admin_hardcoded_guard.sql),
// which every admin screen's data actually depends on.
const ADMIN_EMAIL = 'hfakih1212@gmail.com'

export function isHardcodedAdmin(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL
}
