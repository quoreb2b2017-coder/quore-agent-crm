-- 0024_security_hardening.sql
-- Phase B security fixes from the ISO 27001 / SOC 2 gap assessment.
--
--   F-03  Staff roles (AGENT / DATABASE / EMAIL_MARKETING) were "admin-like" in
--         RLS and held salary.view, attendance.manage, leave.approve, ... so any
--         agent could read every employee's salary via the public API.
--   F-04  employees.manage holders (HR) could assign themselves SUPER_ADMIN or
--         edit their own employee / salary / attendance / leave rows.
--   F-05  audit_logs lost the actor for every app write (service role => NULL),
--         had no tamper protection, and missed attendance / role changes.
--   F-06  Revoked or terminated employees kept access until their JWT expired,
--         because RLS trusted the role / permission claims minted at sign-in.
--   F-12  get_employee_permissions(uuid) let any user enumerate anyone's grants.
--
-- Safe to re-run.

-- ============================================================
-- 1. Live identity helpers (F-06)
-- ============================================================

-- Employee id for the current request. Claims are signature-verified by
-- PostgREST, but employment status is checked live so a SUSPENDED or
-- TERMINATED employee loses access on the next request.
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
  emp_status text;
begin
  claim := nullif(auth.jwt() ->> 'employee_id', 'null');
  if claim is not null and claim <> '' then
    begin
      emp := claim::uuid;
    exception when invalid_text_representation then
      emp := null;
    end;
  end if;

  if emp is null then
    select id into emp from public.employees where auth_user_id = auth.uid() limit 1;
  end if;

  if emp is null then
    return null;
  end if;

  select employment_status into emp_status from public.employees where id = emp;
  if emp_status is null or emp_status in ('SUSPENDED', 'TERMINATED') then
    return null;
  end if;

  return emp;
end;
$$;

-- Role is always read live; the role_key claim is only a UI hint.
create or replace function public.jwt_role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.role_key
  from public.employee_roles er
  join public.roles r on r.id = er.role_id
  where er.employee_id = public.jwt_employee_id()
    and er.is_primary
  limit 1;
$$;

-- Permissions are always read live (not from the permissions[] claim).
create or replace function public.has_permission(perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  emp uuid;
begin
  emp := public.jwt_employee_id();
  if emp is null then
    return false;
  end if;
  return perm = any (public.get_employee_permissions(emp));
end;
$$;

-- Only Super Admin and HR administer other people's records (F-03).
create or replace function public.is_admin_like()
returns boolean
language sql
stable
as $$
  select public.has_role('SUPER_ADMIN') or public.has_role('HR');
$$;

-- Current actor for audit records. Service-role requests made by the Next.js
-- server carry the verified employee id in the x-worktrack-actor header
-- (src/lib/supabase/data.ts). The header is only honoured for service_role,
-- which only the server holds, so end users cannot spoof it.
create or replace function public.current_request_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_user::text
  );
$$;

create or replace function public.current_request_header(header_name text)
returns text
language sql
stable
as $$
  select nullif(current_setting('request.headers', true), '')::jsonb ->> lower(header_name);
$$;

create or replace function public.current_employee_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  emp uuid;
  header_actor text;
begin
  if public.current_request_role() = 'service_role' then
    header_actor := public.current_request_header('x-worktrack-actor');
    if header_actor is not null then
      begin
        return header_actor::uuid;
      exception when invalid_text_representation then
        return null;
      end;
    end if;
  end if;

  emp := public.jwt_employee_id();
  if emp is not null then
    return emp;
  end if;

  select id into emp from public.employees where auth_user_id = auth.uid() limit 1;
  return emp;
end;
$$;

-- F-12: helpers that reveal other people's grants are not callable directly.
revoke execute on function public.get_employee_permissions(uuid) from public, anon, authenticated;
grant execute on function public.get_employee_permissions(uuid) to service_role;
revoke execute on function public.jwt_employee_id() from anon;
revoke execute on function public.jwt_role_key() from anon;
revoke execute on function public.has_permission(text) from anon;
grant execute on function public.current_employee_id() to authenticated, service_role;

-- ============================================================
-- 2. Least privilege for the shared staff roles (F-03)
-- ============================================================

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.role_key in ('AGENT', 'DATABASE', 'EMAIL_MARKETING')
  and p.permission_key in (
    'salary.view', 'salary.manage', 'payroll.manage',
    'attendance.manage', 'activity.manage',
    'leave.approve', 'policies.manage', 'devices.manage',
    'employees.manage', 'audit_logs.view'
  );

drop policy if exists user_activities_admin_select on public.user_activities;
create policy user_activities_admin_select on public.user_activities
  for select to authenticated
  using (public.is_admin_like() and public.has_permission('activity.view'));

-- ============================================================
-- 3. No self-administration (F-04)
-- ============================================================

-- 0008 let a row match on auth_user_id = auth.uid(), which bypasses the
-- employment-status check in jwt_employee_id() (F-06).
drop policy if exists employees_self_select on public.employees;
create policy employees_self_select on public.employees
  for select to authenticated
  using (id = public.jwt_employee_id());

drop policy if exists employee_roles_manage on public.employee_roles;
create policy employee_roles_manage on public.employee_roles
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') and employee_id <> public.jwt_employee_id())
  with check (public.has_role('SUPER_ADMIN') and employee_id <> public.jwt_employee_id());

drop policy if exists employees_manage on public.employees;
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert to authenticated
  with check (public.has_permission('employees.manage'));
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update to authenticated
  using (public.has_permission('employees.manage') and id <> public.jwt_employee_id())
  with check (public.has_permission('employees.manage') and id <> public.jwt_employee_id());
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees
  for delete to authenticated
  using (public.has_role('SUPER_ADMIN') and id <> public.jwt_employee_id());

drop policy if exists attendance_manage on public.attendance;
create policy attendance_manage on public.attendance
  for all to authenticated
  using (public.has_permission('attendance.manage') and employee_id <> public.jwt_employee_id())
  with check (public.has_permission('attendance.manage') and employee_id <> public.jwt_employee_id());

drop policy if exists breaks_manage on public.breaks;
create policy breaks_manage on public.breaks
  for all to authenticated
  using (public.has_permission('activity.manage') and employee_id <> public.jwt_employee_id())
  with check (public.has_permission('activity.manage') and employee_id <> public.jwt_employee_id());

drop policy if exists leave_requests_approve on public.leave_requests;
create policy leave_requests_approve on public.leave_requests
  for update to authenticated
  using (
    public.has_permission('leave.approve')
    and employee_id <> public.jwt_employee_id()
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  )
  with check (
    public.has_permission('leave.approve')
    and employee_id <> public.jwt_employee_id()
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

drop policy if exists salary_records_manage on public.salary_records;
create policy salary_records_manage on public.salary_records
  for all to authenticated
  using (public.has_permission('salary.manage') and employee_id <> public.jwt_employee_id())
  with check (public.has_permission('salary.manage') and employee_id <> public.jwt_employee_id());

drop policy if exists salary_slips_manage on public.salary_slips;
create policy salary_slips_manage on public.salary_slips
  for all to authenticated
  using (public.has_permission('payroll.manage') and employee_id <> public.jwt_employee_id())
  with check (public.has_permission('payroll.manage') and employee_id <> public.jwt_employee_id());

-- Defence in depth: role assignments cannot target yourself from any API
-- client, whatever the policy says. The service role (server code) passes,
-- because it has no employee identity of its own.
create or replace function public.block_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  if public.current_request_role() in ('authenticated', 'anon') then
    actor := public.jwt_employee_id();
    if actor is not null and coalesce(new.employee_id, old.employee_id) = actor then
      raise exception 'You cannot change your own role assignment'
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_block_self_role_change on public.employee_roles;
create trigger trg_block_self_role_change
  before insert or update or delete on public.employee_roles
  for each row execute function public.block_self_role_change();

-- ============================================================
-- 4. Tamper-evident, attributed audit log (F-05)
-- ============================================================

create sequence if not exists public.audit_logs_chain_seq;

alter table public.audit_logs
  add column if not exists seq bigint,
  add column if not exists actor_source text,
  add column if not exists db_role text,
  add column if not exists request_id text,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

-- Number pre-existing rows (they stay outside the hash chain: row_hash null).
update public.audit_logs a
set seq = numbered.n
from (
  select id, row_number() over (order by created_at, id) as n
  from public.audit_logs
  where seq is null
) numbered
where a.id = numbered.id;

select setval(
  'public.audit_logs_chain_seq',
  greatest((select coalesce(max(seq), 0) from public.audit_logs), 1),
  (select count(*) > 0 from public.audit_logs)
);

create unique index if not exists uq_audit_logs_seq on public.audit_logs(seq);

create or replace function public.audit_row_digest(
  p_prev_hash text,
  p_seq bigint,
  p_created_at timestamptz,
  p_actor uuid,
  p_action text,
  p_table text,
  p_record uuid,
  p_old jsonb,
  p_new jsonb,
  p_request_id text
)
returns text
language sql
immutable
as $$
  select encode(
    sha256(convert_to(
      coalesce(p_prev_hash, '') || '|' ||
      p_seq::text || '|' ||
      to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
      coalesce(p_actor::text, '') || '|' ||
      coalesce(p_action, '') || '|' ||
      coalesce(p_table, '') || '|' ||
      coalesce(p_record::text, '') || '|' ||
      coalesce(p_old::text, '') || '|' ||
      coalesce(p_new::text, '') || '|' ||
      coalesce(p_request_id, ''),
      'UTF8'
    )),
    'hex'
  );
$$;

-- Fills attribution and the hash chain on every insert, whoever inserts.
create or replace function public.audit_logs_seal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_hash text;
begin
  -- Serialise chain extension so concurrent inserts cannot fork the chain.
  -- The lock is held until commit, and seq is taken after acquiring it, so
  -- chain order always equals seq order.
  perform pg_advisory_xact_lock(hashtext('public.audit_logs.chain'));

  new.seq := nextval('public.audit_logs_chain_seq');
  new.created_at := now();
  new.db_role := public.current_request_role();
  new.request_id := coalesce(new.request_id, public.current_request_header('x-request-id'));
  new.actor_source := coalesce(
    new.actor_source,
    case
      when public.current_request_role() = 'service_role'
        and public.current_request_header('x-worktrack-actor') is not null then 'app_server'
      when public.current_request_role() = 'service_role' then 'service_job'
      when public.current_request_role() = 'authenticated' then 'api_user'
      else 'database'
    end
  );

  select row_hash into last_hash from public.audit_logs order by seq desc limit 1;
  new.prev_hash := last_hash;
  new.row_hash := public.audit_row_digest(
    new.prev_hash, new.seq, new.created_at, new.actor_employee_id, new.action,
    new.table_name, new.record_id, new.old_data, new.new_data, new.request_id
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_logs_seal on public.audit_logs;
create trigger trg_audit_logs_seal
  before insert on public.audit_logs
  for each row execute function public.audit_logs_seal();

create or replace function public.audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only (% blocked)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_audit_logs_no_update on public.audit_logs;
create trigger trg_audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();

drop trigger if exists trg_audit_logs_no_truncate on public.audit_logs;
create trigger trg_audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_append_only();

-- Only the security-definer trigger functions write here.
revoke insert, update, delete, truncate on public.audit_logs from public, anon, authenticated, service_role;
revoke all on sequence public.audit_logs_chain_seq from public, anon, authenticated, service_role;
grant select on public.audit_logs to service_role;

-- Verifies the chain; returns the first broken link, or no rows if intact.
create or replace function public.verify_audit_chain(p_from_seq bigint default 1)
returns table (seq bigint, expected_hash text, stored_hash text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  prev text := null;
  expected text;
  first boolean := true;
begin
  for r in
    select a.* from public.audit_logs a
    where a.seq >= p_from_seq and a.row_hash is not null
    order by a.seq
  loop
    if first then
      prev := r.prev_hash;
      first := false;
    end if;
    if r.prev_hash is distinct from prev then
      seq := r.seq; expected_hash := prev; stored_hash := r.prev_hash; reason := 'prev_hash mismatch (row removed or reordered)';
      return next; return;
    end if;
    expected := public.audit_row_digest(
      r.prev_hash, r.seq, r.created_at, r.actor_employee_id, r.action,
      r.table_name, r.record_id, r.old_data, r.new_data, r.request_id
    );
    if expected <> r.row_hash then
      seq := r.seq; expected_hash := expected; stored_hash := r.row_hash; reason := 'row content changed';
      return next; return;
    end if;
    prev := r.row_hash;
  end loop;
end;
$$;

revoke execute on function public.verify_audit_chain(bigint) from public, anon, authenticated;
grant execute on function public.verify_audit_chain(bigint) to service_role;

-- Attendance corrections, role / permission definitions and shift settings
-- were not audited before.
drop trigger if exists trg_audit_attendance on public.attendance;
create trigger trg_audit_attendance
  after insert or update or delete on public.attendance
  for each row execute function public.log_audit_event();

drop trigger if exists trg_audit_roles on public.roles;
create trigger trg_audit_roles
  after insert or update or delete on public.roles
  for each row execute function public.log_audit_event();

drop trigger if exists trg_audit_permissions on public.permissions;
create trigger trg_audit_permissions
  after insert or update or delete on public.permissions
  for each row execute function public.log_audit_event();

drop trigger if exists trg_audit_meetings on public.meetings;
create trigger trg_audit_meetings
  after update on public.meetings
  for each row execute function public.log_audit_event();

-- app_settings has an int primary key, so it gets its own audit function.
create or replace function public.log_audit_event_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_employee_id, action, table_name, record_id, old_data, new_data)
  values (
    public.current_employee_id(),
    tg_op || '_' || tg_table_name,
    tg_table_name,
    null,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_app_settings on public.app_settings;
create trigger trg_audit_app_settings
  after insert or update or delete on public.app_settings
  for each row execute function public.log_audit_event_settings();

notify pgrst, 'reload schema';
