-- Default departments: Admin Control, Sales, Marketing, Database, IT Field.
-- Safe / idempotent: never renames two rows to the same unique name in one update.

alter table public.departments drop constraint if exists departments_kind_check;
alter table public.departments
  add constraint departments_kind_check
  check (
    kind is null
    or kind in ('ADMIN_CONTROL', 'SALES', 'MARKETING', 'DATABASE', 'IT', 'MANAGEMENT', 'HR')
  );

alter table public.roles drop constraint if exists roles_department_kind_check;
alter table public.roles
  add constraint roles_department_kind_check
  check (
    department_kind is null
    or department_kind in ('ADMIN_CONTROL', 'SALES', 'MARKETING', 'DATABASE', 'IT', 'MANAGEMENT', 'HR')
  );

-- 1) Attach kind from old kinds / name hints (name unchanged).
update public.departments
set kind = 'ADMIN_CONTROL'
where kind = 'HR'
   or lower(trim(name)) in ('human resources', 'hr', 'human resource', 'admin control', 'admin');

update public.departments
set kind = 'SALES'
where kind = 'SALES'
   or lower(trim(name)) in ('sales', 'sales operations', 'sales operation', 'sales ops');

update public.departments
set kind = 'DATABASE'
where kind = 'MANAGEMENT'
   or lower(trim(name)) in (
     'database',
     'executive and operations',
     'executive & operations',
     'executive operations',
     'management'
   );

update public.departments
set kind = 'MARKETING'
where lower(trim(name)) in ('marketing', 'email marketing', 'marketing team');

update public.departments
set kind = 'IT'
where lower(trim(name)) in ('it', 'it field', 'it department', 'field it');

-- 2) Canonical name already present → just ensure its kind.
update public.departments set kind = 'ADMIN_CONTROL' where lower(trim(name)) = 'admin control';
update public.departments set kind = 'SALES' where lower(trim(name)) = 'sales';
update public.departments set kind = 'MARKETING' where lower(trim(name)) = 'marketing';
update public.departments set kind = 'DATABASE' where lower(trim(name)) = 'database';
update public.departments set kind = 'IT' where lower(trim(name)) = 'it field';

-- 3) Rename ONE row per kind to the canonical name, only if that name is free.
--    (Pick the oldest row for that kind so we never collide on departments_name_key.)

update public.departments d
set name = 'Admin Control'
from (
  select id
  from public.departments
  where kind = 'ADMIN_CONTROL'
  order by created_at nulls last, id
  limit 1
) pick
where d.id = pick.id
  and lower(trim(d.name)) is distinct from 'admin control'
  and not exists (
    select 1 from public.departments x where lower(trim(x.name)) = 'admin control'
  );

update public.departments d
set name = 'Sales'
from (
  select id
  from public.departments
  where kind = 'SALES'
  order by created_at nulls last, id
  limit 1
) pick
where d.id = pick.id
  and lower(trim(d.name)) is distinct from 'sales'
  and not exists (
    select 1 from public.departments x where lower(trim(x.name)) = 'sales'
  );

update public.departments d
set name = 'Marketing'
from (
  select id
  from public.departments
  where kind = 'MARKETING'
  order by created_at nulls last, id
  limit 1
) pick
where d.id = pick.id
  and lower(trim(d.name)) is distinct from 'marketing'
  and not exists (
    select 1 from public.departments x where lower(trim(x.name)) = 'marketing'
  );

update public.departments d
set name = 'Database'
from (
  select id
  from public.departments
  where kind = 'DATABASE'
  order by created_at nulls last, id
  limit 1
) pick
where d.id = pick.id
  and lower(trim(d.name)) is distinct from 'database'
  and not exists (
    select 1 from public.departments x where lower(trim(x.name)) = 'database'
  );

update public.departments d
set name = 'IT Field'
from (
  select id
  from public.departments
  where kind = 'IT'
  order by created_at nulls last, id
  limit 1
) pick
where d.id = pick.id
  and lower(trim(d.name)) is distinct from 'it field'
  and not exists (
    select 1 from public.departments x where lower(trim(x.name)) = 'it field'
  );

-- 4) Insert only when both kind and name are missing.
insert into public.departments (name, kind)
select v.name, v.kind
from (
  values
    ('Admin Control', 'ADMIN_CONTROL'),
    ('Sales', 'SALES'),
    ('Marketing', 'MARKETING'),
    ('Database', 'DATABASE'),
    ('IT Field', 'IT')
) as v(name, kind)
where not exists (select 1 from public.departments d where d.kind = v.kind)
  and not exists (select 1 from public.departments d where lower(trim(d.name)) = lower(v.name));

-- 5) Tighten department kind check.
alter table public.departments drop constraint if exists departments_kind_check;
alter table public.departments
  add constraint departments_kind_check
  check (kind is null or kind in ('ADMIN_CONTROL', 'SALES', 'MARKETING', 'DATABASE', 'IT'));

-- 6) Roles map + IT role.
update public.roles set department_kind = 'SALES' where role_key = 'AGENT';
update public.roles set department_kind = 'MARKETING' where role_key = 'EMAIL_MARKETING';
update public.roles set department_kind = 'DATABASE' where role_key = 'DATABASE';
update public.roles set department_kind = 'ADMIN_CONTROL' where role_key = 'HR';

insert into public.roles (role_key, display_name, description, is_system, department_kind)
select 'IT', 'IT', 'IT Field staff', true, 'IT'
where not exists (select 1 from public.roles where role_key = 'IT');

update public.roles set department_kind = 'IT' where role_key = 'IT';

alter table public.roles drop constraint if exists roles_department_kind_check;
alter table public.roles
  add constraint roles_department_kind_check
  check (
    department_kind is null
    or department_kind in ('ADMIN_CONTROL', 'SALES', 'MARKETING', 'DATABASE', 'IT')
  );

comment on column public.departments.kind is
  'ADMIN_CONTROL | SALES | MARKETING | DATABASE | IT — default teams; name is display-only.';

comment on column public.roles.department_kind is
  'Department this role belongs under (same kinds as departments.kind).';
