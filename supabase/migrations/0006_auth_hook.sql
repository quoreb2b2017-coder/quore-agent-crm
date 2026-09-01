-- 0006_auth_hook.sql
-- Custom Access Token Hook: injects employee_id, role_key, permissions[],
-- and employment_status into the JWT so RLS policies (0005) can read
-- auth.jwt() directly without a per-row DB join.
--
-- IMPORTANT (manual step, cannot be done via SQL migration):
-- After this migration is applied, go to Supabase Dashboard ->
-- Authentication -> Hooks -> "Customize Access Token (JWT) Claims hook"
-- and select public.custom_access_token_hook as a Postgres hook.
-- Existing sessions must sign in again (or wait for token refresh) to
-- receive the new claims.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  emp_id uuid;
  emp_role_key text;
  emp_status text;
  perms text[];
begin
  select e.id, e.employment_status, r.role_key
    into emp_id, emp_status, emp_role_key
  from public.employees e
  join public.employee_roles er on er.employee_id = e.id and er.is_primary
  join public.roles r on r.id = er.role_id
  where e.auth_user_id = (event ->> 'user_id')::uuid
  limit 1;

  if emp_id is not null then
    select coalesce(array_agg(distinct p.permission_key), '{}')
      into perms
    from public.employee_roles er
    join public.role_permissions rp on rp.role_id = er.role_id
    join public.permissions p on p.id = rp.permission_id
    where er.employee_id = emp_id;
  else
    perms := '{}';
  end if;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{employee_id}', to_jsonb(emp_id));
  claims := jsonb_set(claims, '{role_key}', to_jsonb(emp_role_key));
  claims := jsonb_set(claims, '{employment_status}', to_jsonb(emp_status));
  claims := jsonb_set(claims, '{permissions}', to_jsonb(coalesce(perms, '{}'::text[])));

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.employees, public.employee_roles, public.roles, public.role_permissions, public.permissions
  to supabase_auth_admin;
