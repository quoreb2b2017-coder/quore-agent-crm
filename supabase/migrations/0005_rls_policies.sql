-- 0005_rls_policies.sql
-- JWT-claim helper functions + RLS policies for every table.
--
-- Helper functions live in `public` (not `auth`) because Supabase migrations
-- do not own the `auth` schema in hosted projects; `public` is the
-- Supabase-documented location for custom RBAC helper functions that read
-- auth.jwt(). Custom claims (employee_id, role_key, permissions[]) are
-- injected by the Auth Hook defined in 0006_auth_hook.sql.

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
begin
  claim := nullif(auth.jwt() ->> 'employee_id', 'null');
  if claim is not null and claim <> '' then
    begin
      return claim::uuid;
    exception when invalid_text_representation then
      null;
    end;
  end if;

  select id into emp
  from public.employees
  where auth_user_id = auth.uid()
  limit 1;

  return emp;
end;
$$;

create or replace function public.jwt_role_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claim text;
  rk text;
begin
  claim := auth.jwt() ->> 'role_key';
  if claim is not null and claim <> '' and claim <> 'null' then
    return claim;
  end if;

  select r.role_key into rk
  from public.employees e
  join public.employee_roles er on er.employee_id = e.id and er.is_primary
  join public.roles r on r.id = er.role_id
  where e.auth_user_id = auth.uid()
  limit 1;

  return rk;
end;
$$;

create or replace function public.has_role(target_role text)
returns boolean
language sql
stable
as $$
  select public.jwt_role_key() = target_role;
$$;

create or replace function public.has_permission(perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  emp uuid;
begin
  claims := auth.jwt() -> 'permissions';
  if claims is not null and jsonb_typeof(claims) = 'array' and jsonb_array_length(claims) > 0 then
    return claims ? perm;
  end if;

  emp := public.jwt_employee_id();
  if emp is null then
    return false;
  end if;

  return perm = any (public.get_employee_permissions(emp));
end;
$$;

create or replace function public.is_admin_like()
returns boolean
language sql
stable
as $$
  select public.has_role('SUPER_ADMIN') or public.has_role('HR');
$$;

-- Server-side fallback (does not trust JWT) for privileged writes that must
-- re-check the live grant, e.g. before processing payroll.
create or replace function public.get_employee_permissions(p_employee_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.permission_key), '{}')
  from public.employee_roles er
  join public.role_permissions rp on rp.role_id = er.role_id
  join public.permissions p on p.id = rp.permission_id
  where er.employee_id = p_employee_id;
$$;

create or replace function public.my_team_employee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where manager_id = public.jwt_employee_id();
$$;

grant execute on function public.jwt_employee_id() to authenticated, anon, service_role;
grant execute on function public.jwt_role_key() to authenticated, anon, service_role;
grant execute on function public.has_permission(text) to authenticated, anon, service_role;
grant execute on function public.get_employee_permissions(uuid) to authenticated, service_role;

-- ============================================================
-- departments / designations / roles / permissions / role_permissions
-- (reference data: broadly readable by any authenticated employee,
-- writable only by Super Admin / HR-with-employees.manage)
-- ============================================================

alter table public.departments enable row level security;
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select to authenticated using (true);
drop policy if exists departments_manage on public.departments;
create policy departments_manage on public.departments
  for all to authenticated
  using (public.is_admin_like() and public.has_permission('employees.manage'))
  with check (public.is_admin_like() and public.has_permission('employees.manage'));

alter table public.designations enable row level security;
drop policy if exists designations_select on public.designations;
create policy designations_select on public.designations
  for select to authenticated using (true);
drop policy if exists designations_manage on public.designations;
create policy designations_manage on public.designations
  for all to authenticated
  using (public.is_admin_like() and public.has_permission('employees.manage'))
  with check (public.is_admin_like() and public.has_permission('employees.manage'));

alter table public.roles enable row level security;
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated using (true);
drop policy if exists roles_manage on public.roles;
create policy roles_manage on public.roles
  for all to authenticated
  using (public.has_role('SUPER_ADMIN'))
  with check (public.has_role('SUPER_ADMIN'));

alter table public.permissions enable row level security;
drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select to authenticated using (true);
drop policy if exists permissions_manage on public.permissions;
create policy permissions_manage on public.permissions
  for all to authenticated
  using (public.has_role('SUPER_ADMIN'))
  with check (public.has_role('SUPER_ADMIN'));

alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);
drop policy if exists role_permissions_manage on public.role_permissions;
create policy role_permissions_manage on public.role_permissions
  for all to authenticated
  using (public.has_role('SUPER_ADMIN'))
  with check (public.has_role('SUPER_ADMIN'));

-- ============================================================
-- employees / employee_roles
-- ============================================================

alter table public.employees enable row level security;

drop policy if exists employees_self_select on public.employees;
create policy employees_self_select on public.employees
  for select to authenticated
  using (id = public.jwt_employee_id());

drop policy if exists employees_manager_select on public.employees;
create policy employees_manager_select on public.employees
  for select to authenticated
  using (manager_id = public.jwt_employee_id());

drop policy if exists employees_broad_select on public.employees;
create policy employees_broad_select on public.employees
  for select to authenticated
  using (public.is_admin_like() or public.has_permission('employees.manage'));

drop policy if exists employees_manage on public.employees;
create policy employees_manage on public.employees
  for all to authenticated
  using (public.has_permission('employees.manage'))
  with check (public.has_permission('employees.manage'));

alter table public.employee_roles enable row level security;

drop policy if exists employee_roles_self_select on public.employee_roles;
create policy employee_roles_self_select on public.employee_roles
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists employee_roles_broad_select on public.employee_roles;
create policy employee_roles_broad_select on public.employee_roles
  for select to authenticated
  using (public.is_admin_like() or public.has_permission('employees.manage'));

drop policy if exists employee_roles_manage on public.employee_roles;
create policy employee_roles_manage on public.employee_roles
  for all to authenticated
  using (public.has_permission('employees.manage'))
  with check (public.has_permission('employees.manage'));

-- ============================================================
-- employee_sessions / attendance / breaks
-- ============================================================

alter table public.employee_sessions enable row level security;

drop policy if exists employee_sessions_self_all on public.employee_sessions;
create policy employee_sessions_self_all on public.employee_sessions
  for all to authenticated
  using (employee_id = public.jwt_employee_id())
  with check (employee_id = public.jwt_employee_id());

drop policy if exists employee_sessions_team_select on public.employee_sessions;
create policy employee_sessions_team_select on public.employee_sessions
  for select to authenticated
  using (
    public.has_permission('activity.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

alter table public.attendance enable row level security;

drop policy if exists attendance_self_select on public.attendance;
create policy attendance_self_select on public.attendance
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists attendance_team_select on public.attendance;
create policy attendance_team_select on public.attendance
  for select to authenticated
  using (
    public.has_permission('attendance.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

drop policy if exists attendance_manage on public.attendance;
create policy attendance_manage on public.attendance
  for all to authenticated
  using (public.has_permission('attendance.manage'))
  with check (public.has_permission('attendance.manage'));

alter table public.breaks enable row level security;

drop policy if exists breaks_self_all on public.breaks;
create policy breaks_self_all on public.breaks
  for all to authenticated
  using (employee_id = public.jwt_employee_id())
  with check (employee_id = public.jwt_employee_id());

drop policy if exists breaks_team_select on public.breaks;
create policy breaks_team_select on public.breaks
  for select to authenticated
  using (
    public.has_permission('activity.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

drop policy if exists breaks_manage on public.breaks;
create policy breaks_manage on public.breaks
  for all to authenticated
  using (public.has_permission('activity.manage'))
  with check (public.has_permission('activity.manage'));

-- ============================================================
-- activity_events / browser_activities / application_activities
-- No authenticated insert/update/delete policy: writes only via a
-- service-role server route (Phase 6 ingest endpoint) or Super Admin tooling.
-- ============================================================

alter table public.activity_events enable row level security;

drop policy if exists activity_events_self_select on public.activity_events;
create policy activity_events_self_select on public.activity_events
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists activity_events_team_select on public.activity_events;
create policy activity_events_team_select on public.activity_events
  for select to authenticated
  using (
    public.has_permission('activity.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

alter table public.browser_activities enable row level security;

drop policy if exists browser_activities_self_select on public.browser_activities;
create policy browser_activities_self_select on public.browser_activities
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists browser_activities_team_select on public.browser_activities;
create policy browser_activities_team_select on public.browser_activities
  for select to authenticated
  using (
    public.has_permission('activity.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

alter table public.application_activities enable row level security;

drop policy if exists application_activities_self_select on public.application_activities;
create policy application_activities_self_select on public.application_activities
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists application_activities_team_select on public.application_activities;
create policy application_activities_team_select on public.application_activities
  for select to authenticated
  using (
    public.has_permission('activity.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

-- ============================================================
-- tasks / task_steps
-- ============================================================

alter table public.tasks enable row level security;

drop policy if exists tasks_self_select on public.tasks;
create policy tasks_self_select on public.tasks
  for select to authenticated
  using (assigned_to = public.jwt_employee_id() or assigned_by = public.jwt_employee_id());

drop policy if exists tasks_broad_select on public.tasks;
create policy tasks_broad_select on public.tasks
  for select to authenticated
  using (public.has_permission('tasks.view'));

drop policy if exists tasks_create on public.tasks;
create policy tasks_create on public.tasks
  for insert to authenticated
  with check (public.has_permission('tasks.create'));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    public.has_permission('tasks.update')
    and (assigned_to = public.jwt_employee_id() or assigned_by = public.jwt_employee_id() or public.is_admin_like())
  )
  with check (
    public.has_permission('tasks.update')
    and (assigned_to = public.jwt_employee_id() or assigned_by = public.jwt_employee_id() or public.is_admin_like())
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_admin_like() and public.has_permission('tasks.update'));

alter table public.task_steps enable row level security;

drop policy if exists task_steps_select on public.task_steps;
create policy task_steps_select on public.task_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_steps.task_id
        and (t.assigned_to = public.jwt_employee_id() or t.assigned_by = public.jwt_employee_id() or public.has_permission('tasks.view'))
    )
  );

drop policy if exists task_steps_manage on public.task_steps;
create policy task_steps_manage on public.task_steps
  for all to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_steps.task_id
        and (t.assigned_to = public.jwt_employee_id() or t.assigned_by = public.jwt_employee_id())
        and public.has_permission('tasks.update')
    )
  )
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_steps.task_id
        and (t.assigned_to = public.jwt_employee_id() or t.assigned_by = public.jwt_employee_id())
        and public.has_permission('tasks.update')
    )
  );

-- ============================================================
-- campaigns / leads
-- ============================================================

alter table public.campaigns enable row level security;

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select to authenticated
  using (public.has_permission('campaigns.view') or owner_id = public.jwt_employee_id());

drop policy if exists campaigns_create on public.campaigns;
create policy campaigns_create on public.campaigns
  for insert to authenticated
  with check (public.has_permission('campaigns.create'));

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
  for update to authenticated
  using (public.has_permission('campaigns.update') and (owner_id = public.jwt_employee_id() or public.is_admin_like()))
  with check (public.has_permission('campaigns.update') and (owner_id = public.jwt_employee_id() or public.is_admin_like()));

drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (public.is_admin_like() and public.has_permission('campaigns.update'));

alter table public.leads enable row level security;

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (public.has_permission('leads.view') or owner_id = public.jwt_employee_id());

drop policy if exists leads_manage on public.leads;
create policy leads_manage on public.leads
  for all to authenticated
  using (public.has_permission('leads.manage') or owner_id = public.jwt_employee_id())
  with check (public.has_permission('leads.manage') or owner_id = public.jwt_employee_id());

-- ============================================================
-- salary_records / salary_slips
-- ============================================================

alter table public.salary_records enable row level security;

drop policy if exists salary_records_self_select on public.salary_records;
create policy salary_records_self_select on public.salary_records
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists salary_records_broad_select on public.salary_records;
create policy salary_records_broad_select on public.salary_records
  for select to authenticated
  using (public.has_permission('salary.view'));

drop policy if exists salary_records_manage on public.salary_records;
create policy salary_records_manage on public.salary_records
  for all to authenticated
  using (public.has_permission('salary.manage'))
  with check (public.has_permission('salary.manage'));

alter table public.salary_slips enable row level security;

drop policy if exists salary_slips_self_select on public.salary_slips;
create policy salary_slips_self_select on public.salary_slips
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists salary_slips_broad_select on public.salary_slips;
create policy salary_slips_broad_select on public.salary_slips
  for select to authenticated
  using (public.has_permission('salary.view'));

drop policy if exists salary_slips_manage on public.salary_slips;
create policy salary_slips_manage on public.salary_slips
  for all to authenticated
  using (public.has_permission('payroll.manage'))
  with check (public.has_permission('payroll.manage'));

-- ============================================================
-- leave_types / leave_balances / leave_requests
-- ============================================================

alter table public.leave_types enable row level security;
drop policy if exists leave_types_select on public.leave_types;
create policy leave_types_select on public.leave_types
  for select to authenticated using (true);
drop policy if exists leave_types_manage on public.leave_types;
create policy leave_types_manage on public.leave_types
  for all to authenticated
  using (public.is_admin_like())
  with check (public.is_admin_like());

alter table public.leave_balances enable row level security;

drop policy if exists leave_balances_self_select on public.leave_balances;
create policy leave_balances_self_select on public.leave_balances
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists leave_balances_broad_select on public.leave_balances;
create policy leave_balances_broad_select on public.leave_balances
  for select to authenticated
  using (public.has_permission('leave.view'));

drop policy if exists leave_balances_manage on public.leave_balances;
create policy leave_balances_manage on public.leave_balances
  for all to authenticated
  using (public.is_admin_like())
  with check (public.is_admin_like());

alter table public.leave_requests enable row level security;

drop policy if exists leave_requests_self_select on public.leave_requests;
create policy leave_requests_self_select on public.leave_requests
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists leave_requests_team_select on public.leave_requests;
create policy leave_requests_team_select on public.leave_requests
  for select to authenticated
  using (
    public.has_permission('leave.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

drop policy if exists leave_requests_apply on public.leave_requests;
create policy leave_requests_apply on public.leave_requests
  for insert to authenticated
  with check (public.has_permission('leave.apply') and employee_id = public.jwt_employee_id());

drop policy if exists leave_requests_self_update on public.leave_requests;
create policy leave_requests_self_update on public.leave_requests
  for update to authenticated
  using (employee_id = public.jwt_employee_id() and status = 'PENDING')
  with check (employee_id = public.jwt_employee_id() and status in ('PENDING', 'CANCELLED'));

drop policy if exists leave_requests_approve on public.leave_requests;
create policy leave_requests_approve on public.leave_requests
  for update to authenticated
  using (
    public.has_permission('leave.approve')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  )
  with check (
    public.has_permission('leave.approve')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

-- ============================================================
-- notifications
-- ============================================================

alter table public.notifications enable row level security;

drop policy if exists notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update to authenticated
  using (employee_id = public.jwt_employee_id())
  with check (employee_id = public.jwt_employee_id());

drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications
  for insert to authenticated
  with check (public.is_admin_like());

-- ============================================================
-- policy_violations / work_policies
-- ============================================================

alter table public.policy_violations enable row level security;

drop policy if exists policy_violations_self_select on public.policy_violations;
create policy policy_violations_self_select on public.policy_violations
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists policy_violations_broad_select on public.policy_violations;
create policy policy_violations_broad_select on public.policy_violations
  for select to authenticated
  using (
    public.has_permission('activity.view')
    and (public.is_admin_like() or employee_id in (select public.my_team_employee_ids()))
  );

drop policy if exists policy_violations_manage on public.policy_violations;
create policy policy_violations_manage on public.policy_violations
  for all to authenticated
  using (public.has_permission('policies.manage'))
  with check (public.has_permission('policies.manage'));

alter table public.work_policies enable row level security;

drop policy if exists work_policies_select on public.work_policies;
create policy work_policies_select on public.work_policies
  for select to authenticated
  using (public.has_permission('policies.manage') or public.is_admin_like());

drop policy if exists work_policies_manage on public.work_policies;
create policy work_policies_manage on public.work_policies
  for all to authenticated
  using (public.has_permission('policies.manage'))
  with check (public.has_permission('policies.manage'));

-- ============================================================
-- devices
-- ============================================================

alter table public.devices enable row level security;

drop policy if exists devices_self_select on public.devices;
create policy devices_self_select on public.devices
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists devices_broad_select on public.devices;
create policy devices_broad_select on public.devices
  for select to authenticated
  using (public.has_permission('devices.manage'));

drop policy if exists devices_manage on public.devices;
create policy devices_manage on public.devices
  for all to authenticated
  using (public.has_permission('devices.manage'))
  with check (public.has_permission('devices.manage'));

-- ============================================================
-- audit_logs (read-only for authenticated; no insert/update/delete policy —
-- the trigger function is security definer and runs as the table owner,
-- which bypasses RLS by default)
-- ============================================================

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.has_permission('audit_logs.view'));
