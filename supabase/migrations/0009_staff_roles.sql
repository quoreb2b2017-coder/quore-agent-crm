-- Shared staff types: Agent, Database, Email Marketing.
-- They use the same modules. Super Admin still creates employees.

insert into public.roles (role_key, display_name, description, is_system)
values
  ('AGENT', 'Agent', 'Agent staff — same workspace as Database and Email Marketing', true),
  ('DATABASE', 'Database', 'Database staff — same workspace as Agent and Email Marketing', true),
  ('EMAIL_MARKETING', 'Email Marketing', 'Email marketing staff — same workspace as Agent and Database', true)
on conflict (role_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  is_system = true;

create or replace function public.is_admin_like()
returns boolean
language sql
stable
as $$
  select
    public.has_role('SUPER_ADMIN')
    or public.has_role('HR')
    or public.has_role('AGENT')
    or public.has_role('DATABASE')
    or public.has_role('EMAIL_MARKETING');
$$;

-- Same feature set for the three staff types (no extra roles/permissions UI).
with staff_perms (permission_key) as (
  values
    ('attendance.view'),
    ('attendance.manage'),
    ('activity.view'),
    ('activity.manage'),
    ('tasks.view'),
    ('tasks.create'),
    ('tasks.update'),
    ('salary.view'),
    ('leave.view'),
    ('leave.apply'),
    ('leave.approve'),
    ('policies.manage')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join staff_perms sp
join public.permissions p on p.permission_key = sp.permission_key
where r.role_key in ('AGENT', 'DATABASE', 'EMAIL_MARKETING')
on conflict (role_id, permission_id) do nothing;
