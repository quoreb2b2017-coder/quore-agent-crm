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

-- Seed the three org departments when missing (names can be renamed later).
insert into public.departments (name, kind)
select v.name, v.kind
from (
  values
    ('Sales Operations', 'SALES'),
    ('Executive and Operations', 'MANAGEMENT'),
    ('Human Resources', 'HR')
) as v(name, kind)
where not exists (
  select 1 from public.departments d where d.kind = v.kind
);

-- Rename legacy seeded titles to the current defaults (only if still on old name).
update public.departments set name = 'Sales Operations' where kind = 'SALES' and name in ('Sales', 'Sales Operation', 'Sales Ops');
update public.departments set name = 'Executive and Operations' where kind = 'MANAGEMENT' and name in ('Management', 'Executive & Operations', 'Executive Operations');
update public.departments set name = 'Human Resources' where kind = 'HR' and name in ('HR', 'Human Resource');
