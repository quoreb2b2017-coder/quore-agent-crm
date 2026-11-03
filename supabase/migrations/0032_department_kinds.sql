-- Org departments have a stable kind (role group). Display name stays editable.

alter table public.departments
  add column if not exists kind text;

alter table public.departments
  drop constraint if exists departments_kind_check;

alter table public.departments
  add constraint departments_kind_check
  check (kind is null or kind in ('SALES', 'MANAGEMENT', 'HR'));

comment on column public.departments.kind is
  'Role group: SALES→Agent (Sales Operations), MANAGEMENT→Database/Email Marketing (Executive and Operations), HR→HR (Human Resources). Name is display-only.';

-- 1) Attach kind to rows that already exist under old/new names (no insert = no name conflict).
update public.departments
set kind = 'HR', name = 'Human Resources'
where kind is distinct from 'HR'
  and lower(trim(name)) in ('human resources', 'hr', 'human resource');

update public.departments
set kind = 'SALES', name = 'Sales Operations'
where kind is distinct from 'SALES'
  and lower(trim(name)) in ('sales', 'sales operations', 'sales operation', 'sales ops');

update public.departments
set kind = 'MANAGEMENT', name = 'Executive and Operations'
where kind is distinct from 'MANAGEMENT'
  and lower(trim(name)) in (
    'executive',
    'management',
    'executive and operations',
    'executive & operations',
    'executive operations'
  );

-- 2) Insert only when that kind is still missing AND the target name is free.
insert into public.departments (name, kind)
select v.name, v.kind
from (
  values
    ('Human Resources', 'HR'),
    ('Sales Operations', 'SALES'),
    ('Executive and Operations', 'MANAGEMENT')
) as v(name, kind)
where not exists (select 1 from public.departments d where d.kind = v.kind)
  and not exists (select 1 from public.departments d where lower(trim(d.name)) = lower(v.name));

-- 3) If kind still missing but a free-named row was skipped, set kind on the name match.
update public.departments set kind = 'HR' where kind is null and lower(trim(name)) = 'human resources';
update public.departments set kind = 'SALES' where kind is null and lower(trim(name)) = 'sales operations';
update public.departments set kind = 'MANAGEMENT' where kind is null and lower(trim(name)) = 'executive and operations';
