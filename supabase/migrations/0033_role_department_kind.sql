-- Roles belong under a department kind (hierarchy: department type → roles).
alter table public.roles
  add column if not exists department_kind text;

alter table public.roles
  drop constraint if exists roles_department_kind_check;

alter table public.roles
  add constraint roles_department_kind_check
  check (
    department_kind is null
    or department_kind in ('SALES', 'MANAGEMENT', 'HR')
  );

comment on column public.roles.department_kind is
  'Which department type this role appears under (SALES / MANAGEMENT / HR).';

-- Backfill known staff / HR roles.
update public.roles set department_kind = 'SALES' where role_key = 'AGENT' and department_kind is null;
update public.roles set department_kind = 'MANAGEMENT' where role_key in ('DATABASE', 'EMAIL_MARKETING') and department_kind is null;
update public.roles set department_kind = 'HR' where role_key = 'HR' and department_kind is null;
