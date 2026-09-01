-- 0001_core_schema.sql
-- Core identity/RBAC schema: roles, permissions, employees, departments, designations.
-- Safe to re-run (IF NOT EXISTS). If you only need RLS helpers, run
-- supabase/migrations/0008_jwt_claim_fallback.sql instead.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- departments / designations
-- ============================================================

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  head_employee_id uuid, -- FK to employees added after employees exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid references public.departments(id) on delete set null,
  level int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, department_id)
);

drop trigger if exists trg_designations_updated_at on public.designations;
create trigger trg_designations_updated_at
  before update on public.designations
  for each row execute function public.set_updated_at();

-- ============================================================
-- roles / permissions
-- ============================================================

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  display_name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  description text,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create index if not exists idx_role_permissions_role on public.role_permissions(role_id);
create index if not exists idx_role_permissions_permission on public.role_permissions(permission_id);

-- ============================================================
-- employees
-- ============================================================

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  employee_code text not null unique,
  full_name text not null,
  email citext not null unique,
  phone text,
  profile_image_path text,
  department_id uuid references public.departments(id) on delete set null,
  designation_id uuid references public.designations(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null,
  joining_date date not null default current_date,
  salary numeric(12, 2),
  employment_status text not null default 'ACTIVE'
    check (employment_status in ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED')),
  work_location text,
  work_schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employees_manager on public.employees(manager_id);
create index if not exists idx_employees_department on public.employees(department_id);
create index if not exists idx_employees_auth_user on public.employees(auth_user_id);
create index if not exists idx_employees_employment_status on public.employees(employment_status);

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

do $$
begin
  alter table public.departments
    add constraint fk_departments_head_employee
    foreign key (head_employee_id) references public.employees(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- employee_roles (join table; single primary role per employee in v1)
-- ============================================================

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

create index if not exists idx_employee_roles_role on public.employee_roles(role_id);

-- ============================================================
-- helper functions used by RLS / server code (defined here, policies in 0005)
-- ============================================================

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where auth_user_id = auth.uid();
$$;
