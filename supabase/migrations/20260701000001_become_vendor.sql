-- Allows a shopper to self-promote to vendor. Security-definer so the client
-- cannot directly update users.role (blocked by RLS).
create or replace function public.become_vendor()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set role = 'vendor'
  where id = auth.uid()
    and role = 'shopper';
end;
$$;

grant execute on function public.become_vendor() to authenticated;
