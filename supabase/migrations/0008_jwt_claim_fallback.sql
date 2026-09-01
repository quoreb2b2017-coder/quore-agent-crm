-- JWT claim helpers that still work when the Auth Hook is not enabled.
-- Policies call these functions; without a fallback, Super Admin sees
-- an empty app after login.

create or replace function public.get_employee_permissions(p_employee_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.permission_key), '{}')
  from public.employee_roles er
  join public.role_permissions rp on rp.role_id = er.role_id
  join public.permissions p on p.id = rp.permission_id
  where er.employee_id = p_employee_id;
$$;

create or replace function public.jwt_employee_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claim text;
  emp uuid;
begin
  claim := nullif(auth.jwt() ->> 'employee_id', 'null');
  if claim is not null and claim <> '' then
    begin
      return claim::uuid;
    exception when invalid_text_representation then
      null;
    end;
  end if;

  select id into emp
  from public.employees
  where auth_user_id = auth.uid()
  limit 1;

  return emp;
end;
$$;

create or replace function public.jwt_role_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claim text;
  rk text;
begin
  claim := auth.jwt() ->> 'role_key';
  if claim is not null and claim <> '' and claim <> 'null' then
    return claim;
  end if;

  select r.role_key into rk
  from public.employees e
  join public.employee_roles er on er.employee_id = e.id and er.is_primary
  join public.roles r on r.id = er.role_id
  where e.auth_user_id = auth.uid()
  limit 1;

  return rk;
end;
$$;

create or replace function public.has_permission(perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  emp uuid;
begin
  claims := auth.jwt() -> 'permissions';
  if claims is not null and jsonb_typeof(claims) = 'array' and jsonb_array_length(claims) > 0 then
    return claims ? perm;
  end if;

  emp := public.jwt_employee_id();
  if emp is null then
    return false;
  end if;

  return perm = any (public.get_employee_permissions(emp));
end;
$$;

grant execute on function public.get_employee_permissions(uuid) to authenticated, service_role;
grant execute on function public.jwt_employee_id() to authenticated, anon, service_role;
grant execute on function public.jwt_role_key() to authenticated, anon, service_role;
grant execute on function public.has_permission(text) to authenticated, anon, service_role;

grant usage on schema public to authenticated, anon, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table public.employees enable row level security;

do $$
begin
  drop policy if exists employees_self_select on public.employees;
exception when undefined_object then
  null;
end $$;

do $$
begin
  create policy employees_self_select on public.employees
    for select to authenticated
    using (id = public.jwt_employee_id() or auth_user_id = auth.uid());
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
