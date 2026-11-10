-- WorkTrack: migrations 0042 to 0048 in one file, for the Supabase SQL Editor.
-- Generated from supabase/migrations; those files stay the source of truth.
-- Safe to run more than once. Run 0040 and 0041 first if they are not applied yet.

-- ====================================================================
-- 0042_sign_in_attempts_retention.sql
-- ====================================================================
-- 1. Open-breaks index (docs/performance/proposed-indexes.sql).
--    Plain create index: migrations run inside a transaction, where CONCURRENTLY is not allowed.
--    The table is small enough that the build takes well under a second.
create index if not exists idx_breaks_open
  on public.breaks (employee_id)
  where ended_at is null;

-- 2. Every password sign-in, kept for security alerts and the lockout.
--    Written by the server only, after it has really asked Supabase Auth.
create table if not exists public.auth_sign_in_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip text,
  user_agent text,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sign_in_attempts_email_idx
  on public.auth_sign_in_attempts (email, created_at desc);
create index if not exists auth_sign_in_attempts_ip_idx
  on public.auth_sign_in_attempts (ip, created_at desc);

alter table public.auth_sign_in_attempts enable row level security;
revoke all on public.auth_sign_in_attempts from public, anon, authenticated;
grant all on public.auth_sign_in_attempts to service_role;

-- 3. Retention for short-lived operational data. Records the business keeps
--    (attendance, leave, salary, payslips, audit logs, onboarding) are never touched here.
create or replace function public.purge_operational_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.employee_presence where last_seen_at < now() - interval '30 days';
  delete from public.auth_sign_in_attempts where created_at < now() - interval '180 days';
  delete from public.notifications where is_read and created_at < now() - interval '180 days';
  delete from public.push_subscriptions where updated_at < now() - interval '180 days';
end;
$$;

revoke all on function public.purge_operational_data() from public, anon, authenticated;
grant execute on function public.purge_operational_data() to service_role;

-- Daily at 03:30 UTC once pg_cron is enabled (Supabase: Database > Extensions).
-- Without it the function still exists and can be run by hand.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'worktrack-retention';
    perform cron.schedule('worktrack-retention', '30 3 * * *', 'select public.purge_operational_data()');
  end if;
end;
$$;

-- ====================================================================
-- 0043_salary_change_requests.sql
-- ====================================================================
-- Two-person rule for pay (backlog item 16, F-07): a salary set by HR waits here until a
-- Super Admin who did not ask for it approves it. Only then is a salary_records row written,
-- so payslips, history and onboarding never see an unapproved salary.
create table if not exists public.salary_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- The salary_records row to write on approval (without created_by).
  record jsonb not null,
  requested_by uuid references public.employees (id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  -- The person who asked can never be the one who decides.
  constraint salary_change_requests_two_people check (decided_by is null or decided_by <> requested_by)
);

create index if not exists salary_change_requests_pending_idx
  on public.salary_change_requests (created_at)
  where status = 'PENDING';

alter table public.salary_change_requests enable row level security;
revoke all on public.salary_change_requests from public, anon, authenticated;
grant all on public.salary_change_requests to service_role;

-- Every request and decision lands in the tamper-evident audit log.
drop trigger if exists trg_audit_salary_change_requests on public.salary_change_requests;
create trigger trg_audit_salary_change_requests
  after insert or update or delete on public.salary_change_requests
  for each row execute function public.log_audit_event();

-- ====================================================================
-- 0044_policy_acknowledgements.sql
-- ====================================================================
-- Who read which notice or policy, and when (backlog item 22; controls WT-PRV-01, WT-PPL-01).
-- A new version of a document needs a new acknowledgement, so the version is part of the key.
create table if not exists public.policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  document_key text not null,
  version text not null,
  acknowledged_at timestamptz not null default now(),
  constraint policy_acknowledgements_once unique (employee_id, document_key, version)
);

create index if not exists policy_acknowledgements_document_idx
  on public.policy_acknowledgements (document_key, version);

alter table public.policy_acknowledgements enable row level security;
revoke all on public.policy_acknowledgements from public, anon, authenticated;
grant all on public.policy_acknowledgements to service_role;

-- Evidence for the controls: each acknowledgement is in the tamper-evident audit log.
drop trigger if exists trg_audit_policy_acknowledgements on public.policy_acknowledgements;
create trigger trg_audit_policy_acknowledgements
  after insert or update or delete on public.policy_acknowledgements
  for each row execute function public.log_audit_event();

-- ====================================================================
-- 0045_alert_super_admin_grant.sql
-- ====================================================================
-- Security alert when anyone becomes Super Admin (backlog item 20).
-- In the database so it also fires for scripts, the SQL editor and any future screen.
-- The alert lands in every Super Admin's bell; the app shows it as "Security".
create or replace function public.alert_super_admin_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  granted_role text;
  person record;
begin
  select role_key into granted_role from public.roles where id = new.role_id;
  if granted_role is distinct from 'SUPER_ADMIN' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.role_id = new.role_id then
    return new;
  end if;

  select full_name, employee_code into person from public.employees where id = new.employee_id;

  insert into public.notifications (employee_id, type, title, body)
  select er.employee_id,
         'SECURITY_ALERT',
         coalesce(person.full_name, 'Someone') || ' is now a Super Admin',
         coalesce(person.full_name, 'An employee') || ' (' || coalesce(person.employee_code, '?') ||
           ') was given the Super Admin role. If you did not expect this, check the audit log now.'
  from public.employee_roles er
  join public.roles r on r.id = er.role_id and r.role_key = 'SUPER_ADMIN'
  where er.employee_id <> new.employee_id;

  return new;
end;
$$;

revoke all on function public.alert_super_admin_grant() from public, anon, authenticated;

drop trigger if exists trg_alert_super_admin_grant on public.employee_roles;
create trigger trg_alert_super_admin_grant
  after insert or update of role_id on public.employee_roles
  for each row execute function public.alert_super_admin_grant();

-- ====================================================================
-- 0046_staff_least_privilege.sql
-- ====================================================================
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

-- ====================================================================
-- 0047_alert_role_changes_outside_app.sql
-- ====================================================================
-- Security alert when roles or permissions change outside WorkTrack (backlog item 20).
-- Changes made in the app already alert Super Admin with the person's name. A change with no
-- signed-in actor came from the SQL editor, a script or a leaked key, and that is what this catches.
-- One alert per statement, so a bulk change does not flood the bell.
create or replace function public.alert_role_change_outside_app()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_employee_id() is not null then
    return null;
  end if;

  insert into public.notifications (employee_id, type, title, body)
  select er.employee_id,
         'SECURITY_ALERT',
         case tg_table_name
           when 'role_permissions' then 'Role permissions changed outside WorkTrack'
           else 'Someone''s role changed outside WorkTrack'
         end,
         'A ' || lower(tg_op) || ' on ' || replace(tg_table_name, '_', ' ') ||
           ' was made directly in the database, not from WorkTrack. If you did not do this, check the audit log now.'
  from public.employee_roles er
  join public.roles r on r.id = er.role_id and r.role_key = 'SUPER_ADMIN';

  return null;
end;
$$;

revoke all on function public.alert_role_change_outside_app() from public, anon, authenticated;

drop trigger if exists trg_alert_role_permissions_outside_app on public.role_permissions;
create trigger trg_alert_role_permissions_outside_app
  after insert or update or delete on public.role_permissions
  for each statement execute function public.alert_role_change_outside_app();

drop trigger if exists trg_alert_employee_roles_outside_app on public.employee_roles;
create trigger trg_alert_employee_roles_outside_app
  after insert or update or delete on public.employee_roles
  for each statement execute function public.alert_role_change_outside_app();

-- ====================================================================
-- 0048_app_settings_rls.sql
-- ====================================================================
-- app_settings had no Row Level Security while signed-in users held insert, update and delete
-- on it, so anyone with a login could change the company shift times through the database API.
-- Everyone may read the settings (every clock needs them); only Super Admin may change them.
-- Uses jwt_role_key() only: some databases do not have has_role() (it failed on production).
alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_manage on public.app_settings;
create policy app_settings_manage on public.app_settings
  for all to authenticated
  using (public.jwt_role_key() = 'SUPER_ADMIN')
  with check (public.jwt_role_key() = 'SUPER_ADMIN');

revoke all on public.app_settings from anon;
