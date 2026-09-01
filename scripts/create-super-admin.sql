-- One-shot: grants + Super Admin employee row for yesr01164@gmail.com
-- Paste into Supabase SQL Editor and run once.
-- Safe to re-run (skips existing employee / role assignment).
--
-- Do NOT rewrite auth.users.encrypted_password here. GoTrue cannot
-- verify pgcrypto crypt() hashes, and login will return HTTP 400.
-- Create / reset the Auth user with:
--   npx tsx scripts/create-super-admin.ts --email yesr01164@gmail.com --password "..." --name "Gafru"

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  display_name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  description text,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  employee_code text not null unique,
  full_name text not null,
  email citext not null unique,
  phone text,
  profile_image_path text,
  department_id uuid,
  designation_id uuid,
  manager_id uuid,
  joining_date date not null default current_date,
  salary numeric(12, 2),
  employment_status text not null default 'ACTIVE'
    check (employment_status in ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED')),
  work_location text,
  work_schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_roles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  is_primary boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.employees(id) on delete set null
);

create unique index if not exists uq_employee_roles_one_primary
  on public.employee_roles(employee_id)
  where is_primary;

insert into public.roles (role_key, display_name, description, is_system)
values ('SUPER_ADMIN', 'Super Admin', 'Full platform access', true)
on conflict (role_key) do nothing;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant all on tables to service_role;

do $$
declare
  v_user_id uuid;
  v_emp_id uuid;
  v_role_id uuid;
  v_email text := 'yesr01164@gmail.com';
  v_name text := 'Gafru';
begin
  select id into v_role_id from public.roles where role_key = 'SUPER_ADMIN';
  if v_role_id is null then
    raise exception 'SUPER_ADMIN role missing';
  end if;

  select id into v_user_id from auth.users where email = v_email;
  if v_user_id is null then
    raise exception
      'Auth user % is missing. Run scripts/create-super-admin.ts — do not insert into auth.users from SQL.',
      v_email;
  end if;

  select id into v_emp_id from public.employees where email = v_email;
  if v_emp_id is null then
    insert into public.employees (
      auth_user_id, employee_code, full_name, email, employment_status
    ) values (
      v_user_id, 'EMP-ADMIN', v_name, v_email, 'ACTIVE'
    )
    returning id into v_emp_id;
  else
    update public.employees
    set auth_user_id = v_user_id, full_name = v_name, employment_status = 'ACTIVE'
    where id = v_emp_id;
  end if;

  insert into public.employee_roles (employee_id, role_id, is_primary)
  select v_emp_id, v_role_id, true
  where not exists (
    select 1 from public.employee_roles
    where employee_id = v_emp_id and role_id = v_role_id
  );
end $$;

-- RLS helpers: resolve employee/role from auth.uid() when the Auth Hook
-- is not enabled (otherwise login succeeds but the admin app stays empty).

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
