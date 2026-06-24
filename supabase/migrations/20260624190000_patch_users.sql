-- Patch public.users: notification_prefs, push_token, and tightened RLS.
-- Replaces the broad "users_self_or_admin" FOR ALL policy with per-operation
-- policies that prevent direct inserts and self-promotion.

-- ============================================================
-- SECURITY-DEFINER HELPER
-- Reads the calling user's role without triggering RLS recursion.
-- Used by policies on this table and on shipments (migration 005).
-- ============================================================

create or replace function public.current_user_role()
returns text language sql security definer stable as $$
  select role from public.users where id = auth.uid()
$$;

-- ============================================================
-- NEW COLUMNS
-- ============================================================

alter table public.users
  add column if not exists notification_prefs jsonb not null default jsonb_build_object(
    'order_updates',      true,
    'promotions',         true,
    'whatsapp_reminders', true
  ),
  add column if not exists push_token text;

-- ============================================================
-- REPLACE RLS POLICIES
-- Drop the original broad policy then rebuild per-operation.
-- ============================================================

drop policy if exists "users_self_or_admin" on public.users;
drop policy if exists "users_select"        on public.users;
drop policy if exists "users_self_update"   on public.users;
drop policy if exists "users_insert_deny"   on public.users;

-- SELECT: own row or admin
create policy "users_select" on public.users
  for select using (
    id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- UPDATE: own row via USING; WITH CHECK blocks self-promotion —
-- the new `role` value must match the current stored value unless
-- the caller is already an admin.
create policy "users_self_update" on public.users
  for update
  using (
    id = auth.uid()
    or public.current_user_role() = 'admin'
  )
  with check (
    -- Non-admins: new role must equal current role (no self-promotion)
    (id = auth.uid() and role = public.current_user_role())
    -- Admins: no restriction on the written role
    or public.current_user_role() = 'admin'
  );

-- INSERT: explicitly denied for all authenticated callers.
-- Rows enter only via handle_new_auth_user() (security definer trigger),
-- which runs as the function owner and bypasses RLS entirely.
create policy "users_insert_deny" on public.users
  for insert with check (false);
