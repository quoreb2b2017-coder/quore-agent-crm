-- Org departments have a stable kind (role group). Display name stays editable.

alter table public.departments
  add column if not exists kind text;

alter table public.departments
  drop constraint if exists departments_kind_check;

alter table public.departments
  add constraint departments_kind_check
  check (kind is null or kind in ('SALES', 'MANAGEMENT', 'HR'));

comment on column public.departments.kind is
  'Role group: SALES→Agent, MANAGEMENT→Database/Email Marketing, HR→HR. Name is display-only.';

-- Seed the three org departments when missing (names can be renamed later).
insert into public.departments (name, kind)
select v.name, v.kind
from (
  values
    ('Sales', 'SALES'),
    ('Management', 'MANAGEMENT'),
    ('HR', 'HR')
) as v(name, kind)
where not exists (
  select 1 from public.departments d where d.kind = v.kind
);
