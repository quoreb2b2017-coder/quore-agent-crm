-- Enrich JWT with employee profile fields so the app shell loads without extra DB queries.

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
  emp_full_name text;
  emp_code text;
  emp_role_name text;
  perms text[];
begin
  select e.id, e.employment_status, e.full_name, e.employee_code, r.role_key, r.display_name
    into emp_id, emp_status, emp_full_name, emp_code, emp_role_key, emp_role_name
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
  claims := jsonb_set(claims, '{full_name}', to_jsonb(emp_full_name));
  claims := jsonb_set(claims, '{employee_code}', to_jsonb(emp_code));
  claims := jsonb_set(claims, '{role_display_name}', to_jsonb(emp_role_name));
  claims := jsonb_set(claims, '{permissions}', to_jsonb(coalesce(perms, '{}'::text[])));

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
