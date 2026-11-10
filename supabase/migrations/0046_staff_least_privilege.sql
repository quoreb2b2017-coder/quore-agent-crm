-- Least privilege for staff roles (control WT-IAM-03; found by the automated check on 10 Nov 2026).
-- Agent, Database, Email Marketing and other non-management roles held salary.view, leave.approve,
-- policies.manage, attendance.manage and activity.manage. The app never relies on these for staff,
-- but row level security does: with them a staff member could read every salary or approve leave
-- straight through the database API. Only Super Admin and HR may hold them.

-- Same list as public.run_automated_control_checks() (0027).
create or replace function public.is_restricted_permission(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key = any (array[
    'salary.view', 'salary.manage', 'payroll.manage', 'attendance.manage', 'activity.manage',
    'leave.approve', 'policies.manage', 'devices.manage', 'employees.manage', 'audit_logs.view',
    'compliance.manage'
  ]);
$$;

-- 1. Take them away from every role except Super Admin and HR.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.role_key not in ('SUPER_ADMIN', 'HR')
  and public.is_restricted_permission(p.permission_key);

-- 2. Refuse to give them back, whoever asks: the Roles screen, a script or the SQL editor.
create or replace function public.block_restricted_staff_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  permission text;
begin
  select role_key into target_role from public.roles where id = new.role_id;
  select permission_key into permission from public.permissions where id = new.permission_id;
  if target_role not in ('SUPER_ADMIN', 'HR') and public.is_restricted_permission(permission) then
    raise exception 'Only Super Admin and HR can hold %. Staff roles must not (WT-IAM-03).', permission
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.block_restricted_staff_permission() from public, anon, authenticated;

drop trigger if exists trg_block_restricted_staff_permission on public.role_permissions;
create trigger trg_block_restricted_staff_permission
  before insert or update on public.role_permissions
  for each row execute function public.block_restricted_staff_permission();
