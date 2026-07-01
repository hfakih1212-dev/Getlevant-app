-- Fallback for auth users who pre-date the handle_new_auth_user trigger.
-- Called by the client auth store when profile row is missing.
create or replace function public.ensure_my_profile()
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.users;
begin
  insert into public.users (id, email, role, created_at)
  values (auth.uid(), auth.email(), 'shopper', now())
  on conflict (id) do nothing;

  select * into result from public.users where id = auth.uid();
  return result;
end;
$$;

grant execute on function public.ensure_my_profile() to authenticated;
